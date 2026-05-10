"""
Automation Engine — main Celery tasks.
Combines: Rule evaluation + AI analysis + Meta API actions + Alerts.
"""
import logging
from datetime import date, timedelta, datetime, timezone

from celery import shared_task
from django.conf import settings
from django.db.models import Avg, Sum

from apps.meta_ads.models import AdSet, AdInsight, AdAccount
from apps.meta_ads.services import (
    set_adset_status,
    scale_adset_budget,
    get_adset_insights_last_n_days,
    get_ads_insights_for_adset,
    MetaAPIError,
    MetaRateLimitError,
)
from apps.meta_ads.models import Ad
from apps.ai_analyzer.services import analyze_adset, analyze_ads_in_adset, analyze_anomaly, LLMError
from apps.meta_ads.fatigue import detect_fatigue, FatigueSeverity
from .models import AutomationRule, AutomationLog
from .alerts import send_telegram_alert

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Main automation pipeline
# ─────────────────────────────────────────────

@shared_task(name="automations.run_automation_pipeline")
def run_automation_pipeline():
    """
    Dispatcher: runs every 15 min via Beat.
    Dispatches one process_single_adset task per active AdSet so LLM calls
    run in parallel across workers instead of blocking a single worker.
    """
    adset_ids = list(
        AdSet.objects.filter(
            status=AdSet.Status.ACTIVE,
            auto_paused=False,
            campaign__status="ACTIVE",
        ).values_list("adset_id", flat=True)
    )

    logger.info("Dispatching pipeline for %d active adsets", len(adset_ids))
    for adset_id in adset_ids:
        process_single_adset.delay(adset_id)

    detect_anomalies.delay()


@shared_task(
    bind=True,
    max_retries=3,
    name="automations.process_single_adset",
)
def process_single_adset(self, adset_id: str):
    """Process one AdSet: rules → fatigue → AI → act. Retries on Meta rate limits."""
    try:
        adset = AdSet.objects.select_related("campaign__account").get(adset_id=adset_id)
    except AdSet.DoesNotExist:
        logger.warning("AdSet %s not found, skipping", adset_id)
        return

    try:
        _process_adset(adset)
    except MetaRateLimitError as exc:
        logger.warning("Rate limit for adset %s — retrying in %ds", adset_id, exc.wait_seconds)
        raise self.retry(countdown=exc.wait_seconds)
    except Exception:
        logger.exception("Pipeline error for adset %s", adset_id)


def _process_adset(adset: AdSet):
    """Core logic for a single AdSet."""
    insights = get_adset_insights_last_n_days(adset.adset_id, days=3)
    if not insights:
        logger.debug("No insights for adset %s, skipping", adset.adset_id)
        return

    # Aggregate metrics
    avg_cpa = _avg([r["cpa"] for r in insights if r["cpa"] > 0])
    avg_roas = _avg([r["roas"] for r in insights if r["roas"] > 0])
    total_spend = sum(r["spend"] for r in insights)

    metric_snapshot = {
        "avg_cpa": avg_cpa,
        "avg_roas": avg_roas,
        "total_spend": total_spend,
        "days": len(insights),
    }

    # ── Step 1: Hard rule evaluation ──
    rule_action = _evaluate_rules(avg_cpa, avg_roas, total_spend)

    # ── Step 2: Fatigue detection ──
    fatigue = None
    try:
        fatigue = detect_fatigue(adset.adset_id, lookback_days=14)
        if fatigue.is_fatigued:
            logger.info(
                "Fatigue detected for %s: %s (CTR -%.0f%%)",
                adset.adset_id, fatigue.severity, fatigue.ctr_decline_pct,
            )
    except Exception as exc:
        logger.warning("Fatigue detection failed for %s: %s", adset.adset_id, exc)

    # ── Step 3: AI analysis (with fatigue context) ──
    ai_result = None
    try:
        ai_result = analyze_adset(adset.adset_id, adset.name, insights, fatigue_report=fatigue)
        adset.ai_decision = ai_result.decision
        adset.ai_reasoning = ai_result.reasoning
        adset.ai_confidence = ai_result.confidence
        adset.ai_analyzed_at = datetime.now(tz=timezone.utc)
        adset.save(update_fields=["ai_decision", "ai_reasoning", "ai_confidence", "ai_analyzed_at"])
    except LLMError as exc:
        logger.warning("AI analysis failed for adset %s: %s", adset.adset_id, exc)

    # ── Step 3b: Ad-level analysis ──
    _analyze_and_save_ads(adset)

    # ── Step 4: Decide and act ──
    should_pause = (
        rule_action == "PAUSE"
        or (ai_result and ai_result.decision == "PAUSE" and ai_result.confidence >= 0.7)
        # Auto-pause on severe fatigue even without rule/AI confirmation
        or (fatigue and fatigue.severity == FatigueSeverity.SEVERE and avg_cpa > settings.MAX_CPA)
    )
    should_scale = (
        rule_action == "SCALE"
        or (ai_result and ai_result.decision == "SCALE" and ai_result.confidence >= 0.8)
    ) and not should_pause
    should_refresh_creative = (
        ai_result and ai_result.decision == "CREATIVE_REFRESH"
        or (fatigue and fatigue.severity == FatigueSeverity.MODERATE and not should_pause)
    )

    # Actions gated by AUTOMATION_ACTIONS_ENABLED — currently analysis-only mode
    if not settings.AUTOMATION_ACTIONS_ENABLED:
        if should_pause or should_scale or should_refresh_creative:
            action_label = "RECOMMEND_PAUSE" if should_pause else ("RECOMMEND_SCALE" if should_scale else "RECOMMEND_CREATIVE_REFRESH")
            AutomationLog.objects.create(
                adset_id=adset.adset_id,
                adset_name=adset.name,
                trigger_source=AutomationLog.TriggerSource.AI,
                action_taken=action_label,
                ai_decision=ai_result.decision if ai_result else "",
                ai_reasoning=ai_result.reasoning if ai_result else "",
                metric_snapshot=metric_snapshot,
                status=AutomationLog.Status.SUCCESS,
            )
        return

    account_token = adset.campaign.account.access_token

    if should_pause:
        _apply_pause(adset, metric_snapshot, rule_action, ai_result, account_token)
    elif should_scale:
        _apply_scale(adset, metric_snapshot, ai_result, account_token)
    elif should_refresh_creative:
        _alert_creative_refresh(adset, fatigue, ai_result)


def _apply_pause(adset, metric_snapshot, rule_action, ai_result, access_token):
    trigger = AutomationLog.TriggerSource.RULE if rule_action == "PAUSE" else AutomationLog.TriggerSource.AI
    try:
        set_adset_status(adset.adset_id, "PAUSED", access_token=access_token)
        adset.auto_paused = True
        adset.save(update_fields=["auto_paused"])

        AutomationLog.objects.create(
            adset_id=adset.adset_id,
            adset_name=adset.name,
            trigger_source=trigger,
            action_taken="PAUSED",
            ai_decision=ai_result.decision if ai_result else "",
            ai_reasoning=ai_result.reasoning if ai_result else "",
            metric_snapshot=metric_snapshot,
            status=AutomationLog.Status.SUCCESS,
        )

        msg = (
            f"🔴 Auto-PAUSED AdSet: *{adset.name}*\n"
            f"CPA: {metric_snapshot['avg_cpa']:,.0f} VND | ROAS: {metric_snapshot['avg_roas']:.2f}x\n"
            f"Reason: {ai_result.reasoning if ai_result else 'Rule threshold exceeded'}"
        )
        send_telegram_alert.delay(msg)
        logger.info("Paused adset %s", adset.adset_id)

    except MetaAPIError as exc:
        AutomationLog.objects.create(
            adset_id=adset.adset_id,
            adset_name=adset.name,
            trigger_source=trigger,
            action_taken="PAUSED",
            metric_snapshot=metric_snapshot,
            status=AutomationLog.Status.FAILED,
            error_message=str(exc),
        )
        logger.error("Failed to pause adset %s: %s", adset.adset_id, exc)


def _alert_creative_refresh(adset, fatigue, ai_result):
    """Send alert that creative refresh is needed — no automated action, just notify."""
    AutomationLog.objects.create(
        adset_id=adset.adset_id,
        adset_name=adset.name,
        trigger_source=AutomationLog.TriggerSource.AI,
        action_taken="CREATIVE_REFRESH_ALERT",
        ai_decision=ai_result.decision if ai_result else "CREATIVE_REFRESH",
        ai_reasoning=ai_result.reasoning if ai_result else (fatigue.recommendation if fatigue else ""),
        metric_snapshot={
            "fatigue_severity": str(fatigue.severity) if fatigue else "",
            "ctr_decline_pct": fatigue.ctr_decline_pct if fatigue else 0,
            "avg_frequency": fatigue.avg_frequency if fatigue else 0,
        },
        status=AutomationLog.Status.SUCCESS,
    )
    if fatigue:
        msg = (
            f"🎨 Creative Refresh cần thiết: *{adset.name}*\n"
            f"Fatigue: {fatigue.severity} | CTR giảm {fatigue.ctr_decline_pct:.0f}%\n"
            f"Frequency: {fatigue.avg_frequency:.1f}\n"
            f"→ {fatigue.recommendation}"
        )
        send_telegram_alert.delay(msg)


def _apply_scale(adset, metric_snapshot, ai_result, access_token):
    try:
        result = scale_adset_budget(adset.adset_id, factor=1.5, access_token=access_token)
        AutomationLog.objects.create(
            adset_id=adset.adset_id,
            adset_name=adset.name,
            trigger_source=AutomationLog.TriggerSource.AI,
            action_taken=f"SCALED_BUDGET x1.5",
            ai_decision="SCALE",
            ai_reasoning=ai_result.reasoning if ai_result else "",
            metric_snapshot={**metric_snapshot, **result},
            status=AutomationLog.Status.SUCCESS,
        )
        msg = (
            f"🟢 Auto-SCALED AdSet: *{adset.name}*\n"
            f"Budget: {result['old_budget']:,.0f} → {result['new_budget']:,.0f} VND\n"
            f"ROAS: {metric_snapshot['avg_roas']:.2f}x"
        )
        send_telegram_alert.delay(msg)

    except MetaAPIError as exc:
        logger.error("Failed to scale adset %s: %s", adset.adset_id, exc)


def _evaluate_rules(avg_cpa: float, avg_roas: float, total_spend: float) -> str | None:
    """Check active AutomationRules and return the first matching action."""
    rules = AutomationRule.objects.filter(is_active=True).order_by("id")

    metric_map = {
        "cpa": avg_cpa,
        "roas": avg_roas,
        "spend": total_spend,
    }

    op_map = {
        "gt": lambda a, b: a > b,
        "lt": lambda a, b: a < b,
        "gte": lambda a, b: a >= b,
        "lte": lambda a, b: a <= b,
    }

    for rule in rules:
        value = metric_map.get(rule.metric)
        if value is None:
            continue
        check = op_map.get(rule.operator)
        if check and check(value, rule.threshold):
            logger.debug("Rule '%s' matched: %s %s %s", rule.name, rule.metric, rule.operator, rule.threshold)
            return rule.action

    return None


# ─────────────────────────────────────────────
# Anomaly Detection
# ─────────────────────────────────────────────

@shared_task(name="automations.detect_anomalies")
def detect_anomalies():
    """
    Compare last-2-hour CPA vs rolling 7-day baseline.
    If spike >= ANOMALY_CPA_MULTIPLIER, trigger AI analysis + alert.
    Note: Uses AdInsight daily data as proxy (hourly data needs Insights API with hourly breakdowns).
    """
    multiplier = settings.ANOMALY_CPA_MULTIPLIER
    today = date.today()
    cutoff = today - timedelta(days=7)

    # Get all adsets with recent data
    recent = (
        AdInsight.objects
        .filter(date=today, level=AdInsight.Level.ADSET, cpa__gt=0)
        .values("entity_id", "entity_name", "cpa")
    )

    for row in recent:
        baseline_qs = AdInsight.objects.filter(
            entity_id=row["entity_id"],
            level=AdInsight.Level.ADSET,
            date__range=(cutoff, today - timedelta(days=1)),
            cpa__gt=0,
        ).aggregate(avg_cpa=Avg("cpa"))

        baseline_cpa = float(baseline_qs["avg_cpa"] or 0)
        current_cpa = float(row["cpa"])

        if baseline_cpa > 0 and current_cpa > baseline_cpa * multiplier:
            logger.warning(
                "ANOMALY: adset %s CPA %.0f > %.1fx baseline %.0f",
                row["entity_id"], current_cpa, multiplier, baseline_cpa,
            )
            handle_anomaly.delay(
                adset_id=row["entity_id"],
                adset_name=row["entity_name"],
                current_cpa=current_cpa,
                baseline_cpa=baseline_cpa,
            )


@shared_task(name="automations.handle_anomaly")
def handle_anomaly(adset_id: str, adset_name: str, current_cpa: float, baseline_cpa: float):
    """Analyze anomaly via AI and take action."""
    multiplier = current_cpa / baseline_cpa if baseline_cpa else 0

    try:
        result = analyze_anomaly(
            adset_id=adset_id,
            adset_name=adset_name,
            current_cpa=current_cpa,
            baseline_cpa=baseline_cpa,
            anomaly_description=f"CPA spike {multiplier:.1f}x above 7-day baseline",
        )
    except LLMError as exc:
        logger.error("Anomaly AI analysis failed: %s", exc)
        result = {"severity": "HIGH", "immediate_action": "PAUSE", "reasoning": "AI unavailable, applying safety pause"}

    severity = result.get("severity", "HIGH")
    action = result.get("immediate_action", "MONITOR")

    msg = (
        f"⚠️ ANOMALY DETECTED: *{adset_name}*\n"
        f"Severity: {severity}\n"
        f"CPA: {current_cpa:,.0f} VND ({multiplier:.1f}x baseline)\n"
        f"Action: {action}\n"
        f"AI: {result.get('reasoning', '')}"
    )
    send_telegram_alert.delay(msg)

    AutomationLog.objects.create(
        adset_id=adset_id,
        adset_name=adset_name,
        trigger_source=AutomationLog.TriggerSource.ANOMALY,
        action_taken=action,
        ai_reasoning=result.get("reasoning", ""),
        metric_snapshot={"current_cpa": current_cpa, "baseline_cpa": baseline_cpa, "multiplier": multiplier},
        status=AutomationLog.Status.SUCCESS,
    )

    if action == "PAUSE" and settings.AUTOMATION_ACTIONS_ENABLED:
        try:
            adset_obj = AdSet.objects.filter(adset_id=adset_id).first()
            access_token = adset_obj.campaign.account.access_token if adset_obj else None
            set_adset_status(adset_id, "PAUSED", access_token=access_token)
            if adset_obj:
                adset_obj.auto_paused = True
                adset_obj.save(update_fields=["auto_paused"])
        except (MetaAPIError, Exception) as exc:
            logger.error("Failed to pause anomaly adset %s: %s", adset_id, exc)


# ─────────────────────────────────────────────
# On-demand AI analysis (triggered from frontend)
# ─────────────────────────────────────────────

@shared_task(name="automations.trigger_ai_analysis")
def trigger_ai_analysis(adset_id: str) -> dict:
    """
    On-demand AI analysis for a single AdSet.
    Called from the frontend "Analyze Now" button.
    """
    from django.utils import timezone

    adset = AdSet.objects.select_related("campaign__account").get(adset_id=adset_id)
    insights = get_adset_insights_last_n_days(adset_id, days=3)

    if not insights:
        return {"error": "No insight data available for analysis"}

    try:
        result = analyze_adset(adset_id, adset.name, insights)
        adset.ai_decision = result.decision
        adset.ai_reasoning = result.reasoning
        adset.ai_confidence = result.confidence
        adset.ai_analyzed_at = timezone.now()
        adset.save(update_fields=["ai_decision", "ai_reasoning", "ai_confidence", "ai_analyzed_at"])

        return {
            "adset_id": adset_id,
            "decision": result.decision,
            "confidence": result.confidence,
            "reasoning": result.reasoning,
            "raw": result.raw,
        }

    except LLMError as exc:
        return {"error": str(exc)}


def _analyze_and_save_ads(adset: AdSet):
    """Run AI comparison on all ads in this AdSet and persist per-ad decisions."""
    try:
        ads_data = get_ads_insights_for_adset(adset.adset_id, days=7)
        if not ads_data:
            return

        result = analyze_ads_in_adset(adset.name, ads_data, days=7)
        now = datetime.now(tz=timezone.utc)

        for ad_result in result.get("ads", []):
            Ad.objects.filter(ad_id=ad_result["ad_id"]).update(
                ai_decision=ad_result.get("decision", ""),
                ai_reasoning=ad_result.get("reasoning", ""),
                ai_confidence=ad_result.get("confidence"),
                ai_analyzed_at=now,
            )
        logger.info("Ad-level AI done for adset %s: %d ads analyzed", adset.adset_id, len(result.get("ads", [])))
    except LLMError as exc:
        logger.warning("Ad AI analysis failed for adset %s: %s", adset.adset_id, exc)
    except Exception:
        logger.exception("Unexpected error in ad analysis for adset %s", adset.adset_id)


def _avg(values: list) -> float:
    return sum(values) / len(values) if values else 0.0


# ─────────────────────────────────────────────
# Deep Funnel Loop — True CPL per ad
# ─────────────────────────────────────────────

@shared_task(name="automations.deep_funnel_loop")
def deep_funnel_loop():
    """
    Every 30 min:
    1. Score unscored conversations via AI (reads full thread, classifies spam vs lead).
    2. Gather per-ad deep funnel metrics (spend + qualified leads + spam rate).
    3. Call LLM for PAUSE/KEEP/SCALE decision based on True CPL.
    North Star: Cost per Phone Lead — the only metric that matters for beauty clinics.
    """
    from apps.messenger.models import Conversation
    from apps.messenger.tasks import score_lead
    from apps.messenger.services import gather_deep_funnel_metrics
    from apps.ai_analyzer.services import _get_client, _extract_json, LLMError
    from apps.ai_analyzer.prompts import DEEP_FUNNEL_ANALYST, SYSTEM_ADS_ANALYST

    # ── Step 1: Queue scoring for unscored conversations ──────────────────────
    unscored_ids = list(
        Conversation.objects.filter(
            lead_score__isnull=True,
            message_count__gte=1,
        ).exclude(referral_ad_id="")
        .values_list("id", flat=True)[:50]  # cap per run to avoid LLM queue flood
    )
    for conv_id in unscored_ids:
        score_lead.delay(conv_id)
    logger.info("Deep funnel: queued scoring for %d conversations", len(unscored_ids))

    # ── Step 2: Per-ad analysis for ads with conversations ────────────────────
    active_ads = (
        Ad.objects.filter(status=Ad.Status.ACTIVE)
        .select_related("adset__campaign__account")
    )

    client = _get_client()

    for ad in active_ads:
        try:
            metrics = gather_deep_funnel_metrics(ad.ad_id)
        except Exception as exc:
            logger.warning("Failed to gather metrics for ad %s: %s", ad.ad_id, exc)
            continue

        if metrics["total_conversations"] == 0:
            continue

        # Not enough spend to make a decision
        if metrics["total_spend"] < 100_000:
            continue

        prompt = DEEP_FUNNEL_ANALYST.format(
            ad_name=ad.name,
            ad_id=ad.ad_id,
            max_cpa=settings.MAX_CPA,
            **metrics,
        )

        try:
            raw = client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_ADS_ANALYST},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=512,
                response_format={"type": "json_object"},
            )
            result = _extract_json(raw.choices[0].message.content)
        except (LLMError, Exception) as exc:
            logger.warning("Deep funnel LLM failed for ad %s: %s", ad.ad_id, exc)
            continue

        decision = result.get("decision", "KEEP").upper()
        if decision not in ("PAUSE", "KEEP", "SCALE"):
            decision = "KEEP"

        ad.ai_decision = decision
        ad.ai_reasoning = result.get("reasoning", "")
        ad.ai_confidence = float(result.get("confidence", 0.5))
        ad.ai_analyzed_at = datetime.now(tz=timezone.utc)
        ad.save(update_fields=["ai_decision", "ai_reasoning", "ai_confidence", "ai_analyzed_at"])

        AutomationLog.objects.create(
            adset_id=ad.adset.adset_id,
            adset_name=f"{ad.adset.name} / {ad.name}",
            trigger_source=AutomationLog.TriggerSource.AI,
            action_taken=f"DEEP_FUNNEL_{decision}",
            ai_decision=decision,
            ai_reasoning=result.get("reasoning", ""),
            metric_snapshot={
                **metrics,
                "funnel_quality": result.get("funnel_quality", ""),
            },
            status=AutomationLog.Status.SUCCESS,
        )

        logger.info(
            "Deep funnel: ad=%s decision=%s cpl=%s spam_rate=%.0f%%",
            ad.ad_id, decision, metrics["cost_per_qualified_lead"], metrics["spam_rate"],
        )

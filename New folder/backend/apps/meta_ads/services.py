"""
Meta Marketing API service layer.
Uses facebook-business SDK with fallback to raw requests for flexibility.
All public functions raise MetaAPIError on unrecoverable failures.
"""
import logging
import time
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

import requests
from django.conf import settings
from facebook_business.adobjects.adaccount import AdAccount as FBAdAccount
from facebook_business.adobjects.adset import AdSet as FBAdSet
from facebook_business.adobjects.ad import Ad as FBAd
from facebook_business.api import FacebookAdsApi
from facebook_business.exceptions import FacebookRequestError

from .models import AdAccount, AdSet, Ad, AdInsight, Campaign

logger = logging.getLogger(__name__)

INSIGHTS_FIELDS = [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "spend",
    "impressions",
    "clicks",
    "reach",
    "frequency",       # critical for fatigue detection
    "ctr",
    "cpc",
    "cpm",
    "actions",
    "action_values",
    "date_start",
    "date_stop",
]

RATE_LIMIT_WAIT = 60  # seconds to wait on rate limit hit
MAX_RETRIES = 3


class MetaAPIError(Exception):
    pass


class MetaRateLimitError(MetaAPIError):
    """Raised when Meta rate-limits us — Celery tasks should retry with countdown."""
    def __init__(self, wait_seconds: int):
        self.wait_seconds = wait_seconds
        super().__init__(f"Meta rate limit — retry after {wait_seconds}s")


def _init_api(access_token: Optional[str] = None) -> None:
    token = access_token or settings.META_ACCESS_TOKEN
    FacebookAdsApi.init(
        app_id=settings.META_APP_ID,
        app_secret=settings.META_APP_SECRET,
        access_token=token,
    )


def _extract_action_value(actions: list, action_type: str) -> int:
    """Sum all actions matching action_type (e.g. 'offsite_conversion.fb_pixel_purchase')."""
    return sum(
        int(a.get("value", 0))
        for a in (actions or [])
        if a.get("action_type") == action_type
    )


def _extract_action_revenue(action_values: list, action_type: str) -> Decimal:
    return Decimal(
        str(
            sum(
                float(a.get("value", 0))
                for a in (action_values or [])
                if a.get("action_type") == action_type
            )
        )
    )


def fetch_adsets_from_meta(account: AdAccount, days: int = 3) -> list[dict]:
    """
    Fetch AdSet-level insights for the past `days` days.
    Returns list of raw insight dicts from the API.
    """
    _init_api(account.access_token)
    fb_account = FBAdAccount(f"act_{account.account_id.replace('act_', '')}")

    date_preset_map = {1: "yesterday", 3: "last_3d", 7: "last_7d", 30: "last_30d"}
    time_range = None
    date_preset = date_preset_map.get(days)

    if not date_preset:
        today = date.today()
        time_range = {
            "since": (today - timedelta(days=days)).isoformat(),
            "until": today.isoformat(),
        }

    params = {
        "level": "adset",
        "time_increment": 1,
    }
    if date_preset:
        params["date_preset"] = date_preset
    else:
        params["time_range"] = time_range

    results = []
    for attempt in range(MAX_RETRIES):
        try:
            # Pass fields as list (not comma string) to avoid SDK warning
            insights = fb_account.get_insights(fields=INSIGHTS_FIELDS, params=params)
            for row in insights:
                results.append(dict(row))
            logger.info("Fetched %d insight rows for account %s", len(results), account.account_id)
            return results

        except FacebookRequestError as exc:
            if exc.api_error_code() == 17:  # rate limit — caller (Celery task) retries with countdown
                raise MetaRateLimitError(RATE_LIMIT_WAIT * (attempt + 1))
            elif exc.api_error_code() in (1, 2):  # transient
                time.sleep(5 * (attempt + 1))
            else:
                raise MetaAPIError(f"Meta API error {exc.api_error_code()}: {exc.api_error_message()}") from exc

    raise MetaAPIError(f"Failed to fetch insights after {MAX_RETRIES} retries")


def sync_insights_to_db(account: AdAccount, days: int = 3) -> int:
    """
    Pull insights from Meta and upsert into AdInsight table.
    Returns number of rows processed.
    """
    raw_rows = fetch_adsets_from_meta(account, days=days)
    count = 0

    for row in raw_rows:
        actions = row.get("actions", [])
        action_values = row.get("action_values", [])

        # Count ALL lead touch-points — cộng gộp mọi nguồn, không fallback bỏ sót
        # Nếu chỉ dùng fallback (conversions==0 mới lấy pixel), một comment dạo sẽ che khuất
        # toàn bộ pixel conversions thật → AI nhìn thấy CPA sai hoàn toàn
        comments  = _extract_action_value(actions, settings.META_COMMENT_EVENT)
        messages  = _extract_action_value(actions, settings.META_MESSAGE_EVENT)
        pixel_conv = _extract_action_value(actions, settings.META_CONVERSION_EVENT)
        lead_conv  = _extract_action_value(actions, settings.META_LEAD_EVENT)
        conversions = comments + messages + pixel_conv + lead_conv

        revenue = _extract_action_revenue(action_values, settings.META_CONVERSION_EVENT)

        spend = Decimal(str(row.get("spend", 0) or 0))
        impressions = int(row.get("impressions", 0) or 0)
        clicks = int(row.get("clicks", 0) or 0)

        insight, _ = AdInsight.objects.update_or_create(
            entity_id=row["adset_id"],
            level=AdInsight.Level.ADSET,
            date=row["date_start"],
            defaults={
                "entity_name": row.get("adset_name", ""),
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "reach": int(row.get("reach", 0) or 0),
                "conversions": conversions,
                "conversion_value": revenue,
                "frequency": float(row.get("frequency", 0) or 0),
            },
        )
        insight.compute_derived()
        insight.save()
        count += 1

    # Also upsert Campaign + AdSet objects from the insight rows
    _upsert_campaign_adset_objects(account, raw_rows)

    return count


def _upsert_campaign_adset_objects(account: AdAccount, insight_rows: list[dict]) -> None:
    """Create/update Campaign and AdSet model objects from insight rows."""
    for row in insight_rows:
        campaign_id = row.get("campaign_id")
        campaign_name = row.get("campaign_name", "")
        adset_id = row.get("adset_id")
        adset_name = row.get("adset_name", "")

        if not campaign_id or not adset_id:
            continue

        campaign, _ = Campaign.objects.get_or_create(
            campaign_id=campaign_id,
            defaults={"account": account, "name": campaign_name, "status": "ACTIVE"},
        )
        if campaign.name != campaign_name and campaign_name:
            Campaign.objects.filter(campaign_id=campaign_id).update(name=campaign_name)

        AdSet.objects.get_or_create(
            adset_id=adset_id,
            defaults={"campaign": campaign, "name": adset_name, "status": "ACTIVE"},
        )


def set_adset_status(adset_id: str, status: str, access_token: Optional[str] = None) -> bool:
    """
    Toggle an AdSet to ACTIVE or PAUSED.
    status must be 'ACTIVE' or 'PAUSED'.
    Returns True on success.
    """
    if status not in ("ACTIVE", "PAUSED"):
        raise ValueError(f"Invalid status: {status}")

    _init_api(access_token)

    for attempt in range(MAX_RETRIES):
        try:
            adset = FBAdSet(adset_id)
            adset.api_update(fields=[], params={"status": status})
            logger.info("AdSet %s set to %s", adset_id, status)

            AdSet.objects.filter(adset_id=adset_id).update(status=status)
            return True

        except FacebookRequestError as exc:
            if exc.api_error_code() == 17:
                raise MetaRateLimitError(RATE_LIMIT_WAIT * (attempt + 1))
            else:
                logger.error("Failed to set AdSet %s status: %s", adset_id, exc)
                raise MetaAPIError(str(exc)) from exc

    raise MetaAPIError(f"Failed to update AdSet {adset_id} after {MAX_RETRIES} retries")


def set_ad_status(ad_id: str, status: str, access_token: Optional[str] = None) -> bool:
    """Toggle a single Ad to ACTIVE or PAUSED."""
    if status not in ("ACTIVE", "PAUSED"):
        raise ValueError(f"Invalid status: {status}")

    _init_api(access_token)

    for attempt in range(MAX_RETRIES):
        try:
            ad = FBAd(ad_id)
            ad.api_update(fields=[], params={"status": status})
            Ad.objects.filter(ad_id=ad_id).update(status=status)
            logger.info("Ad %s set to %s", ad_id, status)
            return True

        except FacebookRequestError as exc:
            if exc.api_error_code() == 17:
                raise MetaRateLimitError(RATE_LIMIT_WAIT * (attempt + 1))
            else:
                raise MetaAPIError(str(exc)) from exc

    raise MetaAPIError(f"Failed to update Ad {ad_id} after {MAX_RETRIES} retries")


def scale_adset_budget(adset_id: str, factor: float, access_token: Optional[str] = None) -> dict:
    """
    Multiply the daily budget of an AdSet by `factor`.
    Returns {"old_budget": X, "new_budget": Y}.
    """
    _init_api(access_token)
    adset_obj = FBAdSet(adset_id)
    data = adset_obj.api_get(fields=["daily_budget", "lifetime_budget"])

    if data.get("daily_budget"):
        # Meta returns daily_budget as integer in the account's native currency unit.
        # VND (and other zero-decimal currencies) are NOT in cents — no division needed.
        old_budget = int(data["daily_budget"])
        new_budget = int(old_budget * factor)
        adset_obj.api_update(fields=[], params={"daily_budget": new_budget})
        AdSet.objects.filter(adset_id=adset_id).update(daily_budget=Decimal(new_budget))
        logger.info("AdSet %s budget scaled %.1fx: %d → %d", adset_id, factor, old_budget, new_budget)
        return {"old_budget": old_budget, "new_budget": new_budget}

    raise MetaAPIError(f"AdSet {adset_id} has no daily_budget to scale")


def get_adset_insights_last_n_days(adset_id: str, days: int = 3) -> list[dict]:
    """
    Retrieve stored insights for a single AdSet from DB (no API call).
    Returns list sorted oldest → newest.
    """
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=days)
    qs = AdInsight.objects.filter(
        entity_id=adset_id,
        level=AdInsight.Level.ADSET,
        date__gte=cutoff,
    ).order_by("date")

    return [
        {
            "date": str(r.date),
            "spend": float(r.spend),
            "impressions": r.impressions,
            "clicks": r.clicks,
            "conversions": r.conversions,
            "ctr": float(r.ctr),
            "cpc": float(r.cpc),
            "cpa": float(r.cpa),
            "roas": float(r.roas),
            "frequency": float(r.frequency),
        }
        for r in qs
    ]


def sync_ads_to_db(account: AdAccount, days: int = 3) -> int:
    """
    Pull ad-level insights from Meta and upsert into AdInsight (level=ad).
    Also creates/updates Ad objects.
    Returns number of rows processed.
    """
    _init_api(account.access_token)
    fb_account = FBAdAccount(f"act_{account.account_id.replace('act_', '')}")

    date_preset_map = {1: "yesterday", 3: "last_3d", 7: "last_7d", 30: "last_30d"}
    date_preset = date_preset_map.get(days)
    params = {"level": "ad", "time_increment": 1}
    if date_preset:
        params["date_preset"] = date_preset
    else:
        today = date.today()
        params["time_range"] = {
            "since": (today - timedelta(days=days)).isoformat(),
            "until": today.isoformat(),
        }

    results = []
    for attempt in range(MAX_RETRIES):
        try:
            insights = fb_account.get_insights(fields=INSIGHTS_FIELDS, params=params)
            for row in insights:
                results.append(dict(row))
            break
        except FacebookRequestError as exc:
            if exc.api_error_code() == 17:
                raise MetaRateLimitError(RATE_LIMIT_WAIT * (attempt + 1))
            elif exc.api_error_code() in (1, 2):
                time.sleep(5 * (attempt + 1))
            else:
                raise MetaAPIError(str(exc)) from exc

    count = 0
    for row in results:
        actions = row.get("actions", [])
        action_values = row.get("action_values", [])

        comments   = _extract_action_value(actions, settings.META_COMMENT_EVENT)
        messages   = _extract_action_value(actions, settings.META_MESSAGE_EVENT)
        pixel_conv = _extract_action_value(actions, settings.META_CONVERSION_EVENT)
        lead_conv  = _extract_action_value(actions, settings.META_LEAD_EVENT)
        conversions = comments + messages + pixel_conv + lead_conv

        revenue = _extract_action_revenue(action_values, settings.META_CONVERSION_EVENT)
        spend = Decimal(str(row.get("spend", 0) or 0))

        ad_id = row.get("ad_id", "")
        adset_id = row.get("adset_id", "")
        if not ad_id or not adset_id:
            continue

        # Ensure Ad object exists
        adset_obj = AdSet.objects.filter(adset_id=adset_id).first()
        if adset_obj:
            Ad.objects.get_or_create(
                ad_id=ad_id,
                defaults={
                    "adset": adset_obj,
                    "name": row.get("ad_name", ""),
                    "status": "ACTIVE",
                },
            )

        insight, _ = AdInsight.objects.update_or_create(
            entity_id=ad_id,
            level=AdInsight.Level.AD,
            date=row["date_start"],
            defaults={
                "entity_name": row.get("ad_name", ""),
                "spend": spend,
                "impressions": int(row.get("impressions", 0) or 0),
                "clicks": int(row.get("clicks", 0) or 0),
                "reach": int(row.get("reach", 0) or 0),
                "conversions": conversions,
                "comment_count": comments,
                "message_count": messages,
                "conversion_value": revenue,
                "frequency": float(row.get("frequency", 0) or 0),
            },
        )
        insight.compute_derived()
        insight.save()
        count += 1

    logger.info("Synced %d ad-level insight rows for account %s", count, account.account_id)
    return count


def sync_ad_post_mappings(account: AdAccount) -> int:
    """
    Fetch each ad's promoted post ID (object_story_id from creative).
    Stores on Ad.promoted_post_id so we can later link page comments → adset.
    """
    _init_api(account.access_token)
    fb_account = FBAdAccount(f"act_{account.account_id.replace('act_', '')}")

    try:
        # effective_object_story_id = actual running post ID (differs from object_story_id
        # when ads are duplicated or promoted across accounts — this is the one that receives comments)
        ads = fb_account.get_ads(fields=["id", "creative{effective_object_story_id,object_story_id}"])
    except FacebookRequestError as exc:
        raise MetaAPIError(str(exc)) from exc

    count = 0
    for ad in ads:
        creative = ad.get("creative") or {}
        # Prefer effective (actual running post) over original story id
        story_id = creative.get("effective_object_story_id") or creative.get("object_story_id", "")
        if story_id:
            Ad.objects.filter(ad_id=ad["id"]).update(promoted_post_id=story_id)
            count += 1

    logger.info("Mapped %d ads to promoted posts for account %s", count, account.account_id)
    return count


def get_ads_insights_for_adset(adset_id: str, days: int = 7) -> list[dict]:
    """Return aggregated per-ad metrics for all ads in an AdSet from DB."""
    from datetime import date, timedelta
    from django.db.models import Sum, Avg
    cutoff = date.today() - timedelta(days=days)

    ad_ids = list(Ad.objects.filter(adset__adset_id=adset_id).values_list("ad_id", flat=True))
    if not ad_ids:
        return []

    rows = (
        AdInsight.objects
        .filter(entity_id__in=ad_ids, level=AdInsight.Level.AD, date__gte=cutoff)
        .values("entity_id")
        .annotate(
            total_spend=Sum("spend"),
            total_impressions=Sum("impressions"),
            total_clicks=Sum("clicks"),
            total_conversions=Sum("conversions"),
            avg_ctr=Avg("ctr"),
            avg_cpc=Avg("cpc"),
            avg_cpa=Avg("cpa"),
            avg_roas=Avg("roas"),
            avg_frequency=Avg("frequency"),
        )
    )

    # Map ad_id → name + status + AI fields
    ad_meta = {
        a.ad_id: {
            "name": a.name, "status": a.status,
            "ai_decision": a.ai_decision, "ai_reasoning": a.ai_reasoning,
            "ai_confidence": a.ai_confidence,
            "ai_analyzed_at": a.ai_analyzed_at.isoformat() if a.ai_analyzed_at else None,
        }
        for a in Ad.objects.filter(ad_id__in=ad_ids)
    }

    result = []
    for r in rows:
        meta = ad_meta.get(r["entity_id"], {})
        result.append({
            "ad_id": r["entity_id"],
            "ad_name": meta.get("name", ""),
            "status": meta.get("status", ""),
            "ai_decision": meta.get("ai_decision", ""),
            "ai_reasoning": meta.get("ai_reasoning", ""),
            "ai_confidence": meta.get("ai_confidence"),
            "ai_analyzed_at": meta.get("ai_analyzed_at"),
            "spend": float(r["total_spend"] or 0),
            "impressions": int(r["total_impressions"] or 0),
            "clicks": int(r["total_clicks"] or 0),
            "conversions": int(r["total_conversions"] or 0),
            "ctr": float(r["avg_ctr"] or 0),
            "cpc": float(r["avg_cpc"] or 0),
            "cpa": float(r["avg_cpa"] or 0),
            "roas": float(r["avg_roas"] or 0),
            "frequency": float(r["avg_frequency"] or 0),
        })

    result.sort(key=lambda x: x["spend"], reverse=True)
    return result

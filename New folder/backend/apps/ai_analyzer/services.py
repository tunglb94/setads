"""
AI Analyzer service — gpt-oss:20b optimized analysis pipeline.

Model: OpenAI gpt-oss-20b (MoE, 3.6B active params, Apache 2.0)
Key capability: configurable reasoning effort via system prompt prefix "Reasoning: high/medium/low"

Architecture: Two-pass for critical decisions, single-pass for speed-sensitive tasks
  Pass 1 (diagnose): Reasoning=medium — pattern recognition on metrics
  Pass 2 (decide):   Reasoning=high  — consequential PAUSE/SCALE decision
  Anomaly/scoring:   Reasoning=low   — fast triage
"""
import json
import logging
import re
from dataclasses import dataclass
from typing import Optional

from django.conf import settings
from openai import OpenAI, APITimeoutError, APIConnectionError, RateLimitError

from .prompts import (
    SYSTEM_ADS_ANALYST,
    STEP1_DIAGNOSE,
    STEP2_DECIDE,
    CREATIVE_SCORING,
    ANOMALY_ANALYSIS,
    AD_COMPARISON,
)

logger = logging.getLogger(__name__)


class LLMError(Exception):
    pass


@dataclass
class AIAnalysisResult:
    decision: str        # PAUSE | KEEP | SCALE | CREATIVE_REFRESH
    confidence: float
    reasoning: str
    recommended_action: str
    scale_factor: float
    raw: dict            # full raw response from step 2
    diagnosis: dict      # raw response from step 1


def _get_client() -> OpenAI:
    return OpenAI(
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
        timeout=settings.LLM_TIMEOUT,
    )


def _chat(
    client: OpenAI,
    system: str,
    user: str,
    reasoning: str = "medium",  # low | medium | high — gpt-oss reasoning effort
    max_tokens: int = 1024,
) -> str:
    """
    Call the LLM. Prefixes system prompt with reasoning level for gpt-oss.
    Other models (Qwen, Phi, etc.) ignore the prefix harmlessly.
    """
    system_with_effort = f"Reasoning: {reasoning}\n\n{system}"
    try:
        resp = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_with_effort},
                {"role": "user", "content": user},
            ],
            temperature=0.1,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content
    except APITimeoutError as exc:
        raise LLMError(f"LLM timeout after {settings.LLM_TIMEOUT}s") from exc
    except APIConnectionError as exc:
        raise LLMError(f"Cannot connect to LLM at {settings.LLM_BASE_URL}") from exc
    except RateLimitError as exc:
        raise LLMError(f"LLM rate limit: {exc}") from exc


def _extract_json(text: str) -> dict:
    """
    Extract first valid JSON object from LLM output.
    Handles: markdown fences, Qwen3/DeepSeek thinking tags (<think>...</think>),
    and any preamble text before the JSON object.
    """
    # Strip Qwen3 / DeepSeek-R1 thinking blocks
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    # Strip markdown code fences
    text = re.sub(r"```(?:json)?", "", text).strip()
    # Find first { ... } block (greedy — gets the outermost object)
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise LLMError(f"No JSON found in LLM output: {text[:300]}")
    try:
        return json.loads(match.group())
    except json.JSONDecodeError as exc:
        raise LLMError(f"Invalid JSON: {exc}") from exc


def _compute_trend(values: list[float]) -> str:
    if len(values) < 2:
        return "stable"
    pct = (values[-1] - values[0]) / values[0] * 100 if values[0] else 0
    if pct > 10:
        return "increasing"
    if pct < -10:
        return "declining"
    return "stable"


def _avg(values: list[float]) -> float:
    v = [x for x in values if x > 0]
    return sum(v) / len(v) if v else 0.0


def analyze_adset(
    adset_id: str,
    adset_name: str,
    insights: list[dict],
    fatigue_report=None,  # FatigueReport | None
    vertical: str = "default",
) -> AIAnalysisResult:
    """
    Two-step AI analysis for a single AdSet.
    Step 1: Diagnose → Step 2: Decide
    """
    if not insights:
        raise LLMError(f"No insight data for adset {adset_id}")

    # Prepare aggregated context — compute CPA/ROAS from totals, NEVER average of ratios
    total_spend = sum(r["spend"] for r in insights)
    total_conversions = sum(r.get("conversions", 0) for r in insights)
    total_conversion_value = sum(r.get("conversion_value", 0) for r in insights)
    # CPA = total_spend / total_conversions (not avg of daily CPAs — that's mathematically wrong)
    avg_cpa = (total_spend / total_conversions) if total_conversions > 0 else total_spend
    avg_roas = (total_conversion_value / total_spend) if total_spend > 0 else 0
    avg_frequency = _avg([r.get("frequency", 0) for r in insights])
    ctr_trend = _compute_trend([r["ctr"] for r in insights])

    fatigue_severity = getattr(fatigue_report, "severity", "NONE") if fatigue_report else "NONE"
    ctr_decline_pct = getattr(fatigue_report, "ctr_decline_pct", 0) if fatigue_report else 0
    fatigue_signals = getattr(fatigue_report, "signals", []) if fatigue_report else []

    client = _get_client()

    # ── Step 1: Diagnose ─────────────────────────────────────────────────────
    step1_prompt = STEP1_DIAGNOSE.format(
        adset_name=adset_name,
        days=len(insights),
        insights_json=json.dumps(insights, ensure_ascii=False, indent=2),
        total_spend=total_spend,
        total_conversions=total_conversions,
        avg_cpa=avg_cpa,
        max_cpa=settings.MAX_CPA,
        avg_frequency=avg_frequency,
        ctr_trend=ctr_trend,
        fatigue_severity=str(fatigue_severity),
    )
    diagnosis_raw = _extract_json(
        _chat(client, SYSTEM_ADS_ANALYST, step1_prompt, reasoning="medium")
    )
    logger.debug("AdSet %s diagnosis: %s", adset_id, diagnosis_raw)

    # ── Step 2: Decide ───────────────────────────────────────────────────────
    step2_prompt = STEP2_DECIDE.format(
        adset_name=adset_name,
        diagnosis_json=json.dumps(diagnosis_raw, ensure_ascii=False),
        total_spend=total_spend,
        avg_cpa=avg_cpa,
        max_cpa=settings.MAX_CPA,
        avg_frequency=avg_frequency,
        ctr_trend=ctr_trend,
        fatigue_severity=str(fatigue_severity),
    )
    # high reasoning — consequential decision that affects real ad spend
    decision_raw = _extract_json(
        _chat(client, SYSTEM_ADS_ANALYST, step2_prompt, reasoning="high", max_tokens=1536)
    )

    decision = decision_raw.get("decision", "KEEP").upper()
    if decision not in ("PAUSE", "KEEP", "SCALE", "CREATIVE_REFRESH"):
        logger.warning("Unexpected decision '%s', defaulting to KEEP", decision)
        decision = "KEEP"

    result = AIAnalysisResult(
        decision=decision,
        confidence=float(decision_raw.get("confidence", 0.5)),
        reasoning=decision_raw.get("reasoning", ""),
        recommended_action=decision_raw.get("recommended_action", ""),
        scale_factor=float(decision_raw.get("scale_factor", 1.5)),
        raw=decision_raw,
        diagnosis=diagnosis_raw,
    )
    logger.info(
        "AI: adset=%s decision=%s confidence=%.2f",
        adset_id, result.decision, result.confidence,
    )
    return result


def analyze_anomaly(
    adset_id: str,
    adset_name: str,
    current_cpa: float,
    baseline_cpa: float,
    anomaly_description: str,
) -> dict:
    """Rapid anomaly triage — single-step since urgency > decomposition here."""
    multiplier = current_cpa / baseline_cpa if baseline_cpa else 0
    prompt = ANOMALY_ANALYSIS.format(
        adset_name=adset_name,
        adset_id=adset_id,
        anomaly_description=anomaly_description,
        current_cpa=current_cpa,
        baseline_cpa=baseline_cpa,
        multiplier=multiplier,
    )
    client = _get_client()
    raw = _chat(
        client,
        "You are a Meta Ads anomaly detection expert. Respond with valid JSON only.",
        prompt,
        reasoning="low",  # speed > depth for urgent anomaly triage
    )
    return _extract_json(raw)


def analyze_ads_in_adset(
    adset_name: str,
    ads: list[dict],  # from get_ads_insights_for_adset()
    days: int = 7,
) -> dict:
    """
    Compare all ads within an AdSet. Returns per-ad decisions and overall recommendation.
    Single-step (ads comparison doesn't need two-pass decomposition).
    """
    if not ads:
        raise LLMError("No ad data to analyze")

    client = _get_client()
    prompt = AD_COMPARISON.format(
        adset_name=adset_name,
        max_cpa=settings.MAX_CPA,
        days=days,
        ads_json=json.dumps(ads, ensure_ascii=False, indent=2),
    )
    raw = _chat(client, SYSTEM_ADS_ANALYST, prompt, reasoning="medium", max_tokens=2048)
    return _extract_json(raw)


def score_creative_batch(ads_data: list[dict]) -> dict:
    """Analyse a batch of ads and return creative scoring + winning patterns."""
    from .prompts import CREATIVE_SCORING, SYSTEM_CREATIVE_ANALYST
    prompt = CREATIVE_SCORING.format(
        ads_json=json.dumps(ads_data, ensure_ascii=False, indent=2)
    )
    client = _get_client()
    raw = _chat(client, SYSTEM_CREATIVE_ANALYST, prompt)
    return _extract_json(raw)


def generate_weekly_report(
    account_summary: dict,
    performers: dict,
    lead_stats: list[dict],
) -> dict:
    """Generate weekly strategy report for the entire account."""
    from .prompts import WEEKLY_STRATEGY
    prompt = WEEKLY_STRATEGY.format(
        account_summary_json=json.dumps(account_summary, ensure_ascii=False, indent=2),
        performers_json=json.dumps(performers, ensure_ascii=False, indent=2),
        lead_stats_json=json.dumps(lead_stats, ensure_ascii=False, indent=2),
    )
    client = _get_client()
    raw = _chat(client, SYSTEM_ADS_ANALYST, prompt)
    return _extract_json(raw)

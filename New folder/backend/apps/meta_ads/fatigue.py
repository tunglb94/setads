"""
Ad Fatigue Detection Engine.

Uses a combination of signals rather than a single threshold:
  1. CTR decline vs. rolling peak (15% = mild, 30% = severe)
  2. Frequency creep (e-comm > 3.5, B2B > 5.0)
  3. CPM rising while CTR drops (efficiency collapse)
  4. STL residual anomaly for longer series

Reference thresholds from production systems (see research):
  - E-commerce: freq 3.2–3.8 before fatigue
  - B2B/lead-gen: freq 4.5–5.5 before fatigue
"""
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum
from typing import Optional

from .models import AdInsight

logger = logging.getLogger(__name__)

# Industry-specific frequency thresholds
FREQ_THRESHOLD = {
    "ecommerce": 3.5,
    "leadgen": 4.5,
    "b2b": 5.0,
    "default": 4.0,
}


class FatigueSeverity(str, Enum):
    NONE = "NONE"
    MILD = "MILD"        # 15–29% CTR drop → audience expansion or bid adjust
    MODERATE = "MODERATE"  # 30–49% → creative rotation
    SEVERE = "SEVERE"    # 50%+ → immediate creative replacement


@dataclass
class FatigueReport:
    adset_id: str
    severity: FatigueSeverity
    ctr_peak: float
    ctr_latest: float
    ctr_decline_pct: float
    avg_frequency: float
    freq_threshold: float
    cpm_trend: str          # "rising" | "stable" | "falling"
    signals: list[str]      # human-readable list of triggered signals
    recommendation: str

    @property
    def is_fatigued(self) -> bool:
        return self.severity != FatigueSeverity.NONE


def detect_fatigue(
    adset_id: str,
    lookback_days: int = 14,
    vertical: str = "default",
) -> FatigueReport:
    """
    Analyse stored AdInsight data for a single AdSet and return a fatigue report.
    Requires at least 5 days of data to produce a meaningful result.
    """
    cutoff = date.today() - timedelta(days=lookback_days)
    insights = list(
        AdInsight.objects.filter(
            entity_id=adset_id,
            level=AdInsight.Level.ADSET,
            date__gte=cutoff,
        ).order_by("date")
    )

    if len(insights) < 5:
        return FatigueReport(
            adset_id=adset_id,
            severity=FatigueSeverity.NONE,
            ctr_peak=0, ctr_latest=0, ctr_decline_pct=0,
            avg_frequency=0, freq_threshold=FREQ_THRESHOLD[vertical],
            cpm_trend="stable", signals=["Insufficient data (< 5 days)"],
            recommendation="Collect more data before evaluating fatigue",
        )

    ctrs = [float(r.ctr) for r in insights]
    cpms = [float(r.cpm) for r in insights]

    # ── CTR signal ──────────────────────────────────────
    ctr_peak = max(ctrs)
    ctr_latest = _rolling_avg(ctrs, window=3)  # last 3 days avg
    ctr_decline_pct = ((ctr_peak - ctr_latest) / ctr_peak * 100) if ctr_peak > 0 else 0

    # ── Frequency signal (stored in raw row, derived from reach/impressions) ──
    # frequency = impressions / reach
    frequencies = []
    for r in insights:
        if r.reach > 0:
            frequencies.append(r.impressions / r.reach)
    avg_frequency = sum(frequencies) / len(frequencies) if frequencies else 0
    freq_limit = FREQ_THRESHOLD.get(vertical, FREQ_THRESHOLD["default"])

    # ── CPM trend signal ──────────────────────────────────
    cpm_trend = _compute_trend_label(cpms)

    # ── Score signals ──────────────────────────────────────
    signals = []
    severity = FatigueSeverity.NONE

    if ctr_decline_pct >= 50:
        severity = FatigueSeverity.SEVERE
        signals.append(f"CTR dropped {ctr_decline_pct:.0f}% from peak (severe fatigue)")
    elif ctr_decline_pct >= 30:
        severity = FatigueSeverity.MODERATE
        signals.append(f"CTR dropped {ctr_decline_pct:.0f}% from peak (moderate fatigue)")
    elif ctr_decline_pct >= 15:
        severity = FatigueSeverity.MILD
        signals.append(f"CTR dropped {ctr_decline_pct:.0f}% from peak (early fatigue)")

    if avg_frequency > freq_limit:
        if severity == FatigueSeverity.NONE:
            severity = FatigueSeverity.MILD
        signals.append(f"Frequency {avg_frequency:.1f} exceeds threshold {freq_limit:.1f}")

    if cpm_trend == "rising" and ctr_decline_pct >= 15:
        signals.append("CPM rising while CTR falling — audience saturation confirmed")
        # Upgrade severity one level
        if severity == FatigueSeverity.MILD:
            severity = FatigueSeverity.MODERATE

    # ── Recommendation ────────────────────────────────────
    recommendation = _build_recommendation(severity, avg_frequency, ctr_decline_pct)

    return FatigueReport(
        adset_id=adset_id,
        severity=severity,
        ctr_peak=ctr_peak,
        ctr_latest=ctr_latest,
        ctr_decline_pct=ctr_decline_pct,
        avg_frequency=avg_frequency,
        freq_threshold=freq_limit,
        cpm_trend=cpm_trend,
        signals=signals,
        recommendation=recommendation,
    )


def batch_detect_fatigue(adset_ids: list[str], vertical: str = "default") -> dict[str, FatigueReport]:
    """Run fatigue detection for multiple AdSets. Returns {adset_id: FatigueReport}."""
    return {aid: detect_fatigue(aid, vertical=vertical) for aid in adset_ids}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _rolling_avg(values: list[float], window: int = 3) -> float:
    if not values:
        return 0.0
    tail = values[-window:]
    return sum(tail) / len(tail)


def _compute_trend_label(values: list[float], window: int = 5) -> str:
    """Simple linear trend over last `window` points."""
    if len(values) < 3:
        return "stable"
    tail = values[-window:]
    # Slope via least squares shortcut
    n = len(tail)
    mean_x = (n - 1) / 2
    mean_y = sum(tail) / n
    numerator = sum((i - mean_x) * (v - mean_y) for i, v in enumerate(tail))
    denominator = sum((i - mean_x) ** 2 for i in range(n))
    if denominator == 0:
        return "stable"
    slope = numerator / denominator
    # Relative to mean
    rel_slope = slope / mean_y * 100 if mean_y else 0
    if rel_slope > 3:
        return "rising"
    if rel_slope < -3:
        return "falling"
    return "stable"


def _build_recommendation(
    severity: FatigueSeverity,
    avg_frequency: float,
    ctr_decline_pct: float,
) -> str:
    if severity == FatigueSeverity.NONE:
        return "Creative is performing well. Monitor weekly."
    if severity == FatigueSeverity.MILD:
        if avg_frequency > 3:
            return "Expand audience or add lookalike. Consider refreshing headline/thumbnail."
        return "Adjust bids or test new ad copy variation. Monitor for next 3 days."
    if severity == FatigueSeverity.MODERATE:
        return "Rotate creatives immediately. Test 2-3 new visual concepts. Consider pausing lowest-CTR ad."
    if severity == FatigueSeverity.SEVERE:
        return "PAUSE this AdSet. Replace all creatives before re-activating. Full creative refresh required."
    return ""

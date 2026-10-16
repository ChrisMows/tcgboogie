"""Market value from sold comps: lookback window, outlier removal, confidence checks."""
import statistics
from dataclasses import dataclass, field
from datetime import date, timedelta


@dataclass
class MarketValue:
    value: float | None
    comps_used: int = 0
    comps_in_window: int = 0
    outliers_dropped: list = field(default_factory=list)
    low: float | None = None
    high: float | None = None
    spread: float | None = None
    latest_sale: str | None = None
    reason: str = ""

    @property
    def ok(self):
        return self.value is not None


def market_value(comps, deal_cfg, today=None):
    """comps: dicts with sold_date (YYYY-MM-DD), price, shipping, excluded.

    Each comp counts as price + shipping so it compares directly with a listing's price + shipping.
    """
    today = today or date.today()
    lookback = int(deal_cfg["comp_lookback_days"])
    min_comps = int(deal_cfg["min_comps"])
    max_spread = float(deal_cfg["max_comp_spread"])
    cutoff = (today - timedelta(days=lookback)).isoformat()

    recent = [c for c in comps if not c.get("excluded") and c["sold_date"] >= cutoff]
    totals = [float(c["price"]) + float(c.get("shipping") or 0) for c in recent]
    mv = MarketValue(None, comps_in_window=len(totals))
    if recent:
        mv.latest_sale = max(c["sold_date"] for c in recent)
    if len(totals) < min_comps:
        mv.reason = f"only {len(totals)} sold comps in the last {lookback} days (need {min_comps})"
        return mv

    # Drop outliers using median absolute deviation (robust to a single crazy sale).
    med = statistics.median(totals)
    mad = statistics.median(abs(x - med) for x in totals)
    if mad > 0:
        limit = 3 * 1.4826 * mad
        kept = [x for x in totals if abs(x - med) <= limit]
    else:
        kept = [x for x in totals if abs(x - med) <= 0.5 * med]
    mv.outliers_dropped = sorted(x for x in totals if x not in kept)

    mv.comps_used = len(kept)
    if len(kept) < min_comps:
        mv.reason = f"only {len(kept)} comps left after removing outliers (need {min_comps})"
        return mv

    mean = statistics.fmean(kept)
    spread = statistics.pstdev(kept) / mean if mean else 0
    mv.spread, mv.low, mv.high = spread, min(kept), max(kept)
    if spread > max_spread:
        mv.reason = f"comps vary too much ({spread:.0%} spread, limit {max_spread:.0%})"
        return mv

    mv.value = round(statistics.median(kept), 2)
    mv.reason = f"median of {len(kept)} sold comps (${mv.low:,.2f}-${mv.high:,.2f}) from last {lookback} days"
    return mv

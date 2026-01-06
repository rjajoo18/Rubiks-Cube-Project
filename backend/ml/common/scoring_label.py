from __future__ import annotations
from typing import Optional, Sequence
import statistics

def effective_time_ms(time_ms: Optional[int], penalty: str) -> Optional[int]:
    # Convert a raw solve time + penalty into an "effective" time.
    if time_ms is None:
        return None

    if penalty == "DNF":
        return None

    if penalty == "+2":
        return time_ms + 2000

    return time_ms

def baseline_median_ms(history_effective_times: Sequence[int], skill_prior_ms: Optional[int]) -> Optional[float]:
    """
    We use:
    - median of last 50 effective times if we have enough history
    - otherwise fall back to skill_prior_ms (WCA or self-reported)
    - otherwise use median of whatever history we do have
    """
    hist = list(history_effective_times)

    if len(hist) >= 10:
        window = hist[-50:]
        return float(statistics.median(window))

    if skill_prior_ms is not None:
        return float(skill_prior_ms)

    if len(hist) > 0:
        return float(statistics.median(hist))

    return None

def ratio_to_score(r: float) -> float:
    """
    Map ratio r = time / baseline into a 0-100 score.

    Target behavior:
    - r <= 0.70  => 100 (amazing)
    - r == 1.00  => 50  (average)
    - r >= 1.40  => 0   (bad)

    Piecewise linear mapping:
    [0.70, 1.00] maps 100 -> 50
    [1.00, 1.40] maps 50 -> 0
    """
    if r <= 0.70:
        return 100.0
    if r >= 1.40:
        return 0.0

    if r < 1.00:
        t = (r - 0.70) / (1.00 - 0.70)
        return 100.0 + t * (50.0 - 100.0)

    t = (r - 1.00) / (1.40 - 1.00)
    return 50.0 + t * (0.0 - 50.0)


def compute_label_score(
    effective_ms: int,
    baseline_ms: float,
    ) -> float:
    """
    Compute the label score for training.
    """
    r = effective_ms / baseline_ms
    s = ratio_to_score(r)
    # clamp just in case
    return max(0.0, min(100.0, float(s)))


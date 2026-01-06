from __future__ import annotations
from typing import Optional, Sequence
import statistics

from ml.common.scoring_label import baseline_median_ms


def mean(xs: Sequence[int]) -> Optional[float]:
    return float(sum(xs) / len(xs)) if xs else None


def std(xs: Sequence[int]) -> Optional[float]:
    if len(xs) < 2:
        return None
    m = sum(xs) / len(xs)
    var = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
    return float(var ** 0.5)


def build_features(
    *,
    effective_ms: int,
    history_effective_times: Sequence[int],
    skill_prior_ms: Optional[int],
    has_plus2: int,
    num_moves: Optional[int],
    solve_index: int,
) -> dict[str, float]:
    """
    Turn (solve + user context) into a numeric feature dict.

    Important:
    - history_effective_times must be ONLY solves BEFORE this solve.
    - We keep everything numeric (GBM likes that).
    """
    hist = list(history_effective_times)

    ao5 = mean(hist[-5:])
    ao12 = mean(hist[-12:])
    med50 = baseline_median_ms(hist, skill_prior_ms)
    s10 = std(hist[-10:])

    # Fill missing values in a simple, consistent way
    # (must match training + inference)
    if med50 is None:
        med50 = float(skill_prior_ms) if skill_prior_ms is not None else float(effective_ms)

    if ao5 is None:
        ao5 = med50
    if ao12 is None:
        ao12 = ao5
    if s10 is None:
        s10 = 0.0

    ratio_vs_baseline = float(effective_ms) / float(med50)
    delta_vs_baseline = float(effective_ms) - float(med50)

    # num_moves might be None early; fill with 0
    nm = float(num_moves) if num_moves is not None else 0.0

    return {
        "effective_time_ms": float(effective_ms),
        "has_plus2": float(has_plus2),
        "ao5_ms": float(ao5),
        "ao12_ms": float(ao12),
        "baseline50_ms": float(med50),
        "std10_ms": float(s10),
        "ratio_vs_baseline": float(ratio_vs_baseline),
        "delta_vs_baseline_ms": float(delta_vs_baseline),
        "skill_prior_ms": float(skill_prior_ms) if skill_prior_ms is not None else float(med50),
        "num_moves": nm,
        "solve_index": float(solve_index),
    }

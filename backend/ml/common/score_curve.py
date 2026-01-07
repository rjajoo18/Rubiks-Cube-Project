from __future__ import annotations

def score_from_ratio(ratio: float) -> float:
    """
    Convert ratio = (time / baseline) into a 0–100 score.

    - ratio < 1.0 means faster than baseline -> higher score
    - ratio > 1.0 means slower than baseline -> lower score

    This curve is intentionally smooth + stable (no weird discontinuities).
    You can tweak these numbers later without retraining the time model.
    """

    # Safety guardrails
    if ratio <= 0:
        return 100.0

    # A simple piecewise curve:
    # - super fast (<= 0.70x baseline) -> near 100
    # - baseline (1.00x) -> around 50
    # - slow (>= 1.40x) -> near 0
    if ratio <= 0.70:
        return 98.0
    if ratio >= 1.40:
        return 2.0

    # Map [0.70, 1.40] linearly to [98, 2]
    # (You can later replace with a logistic curve if you want.)
    t = (ratio - 0.70) / (1.40 - 0.70)
    score = 98.0 + (2.0 - 98.0) * t
    return float(max(0.0, min(100.0, score)))

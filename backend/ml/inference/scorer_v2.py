from __future__ import annotations
from typing import Tuple

from sqlalchemy.orm import Session

from models import Solve, User
from ml.common.scoring_label import effective_time_ms, baseline_median_ms
from ml.common.features import build_features
from ml.common.score_curve import score_from_ratio
from ml.inference.bundle_loader_v2 import load_bundle_for_version

FEATURE_ORDER = [
    "effective_time_ms",
    "has_plus2",
    "ao5_ms",
    "ao12_ms",
    "baseline50_ms",
    "std10_ms",
    "ratio_vs_baseline",
    "delta_vs_baseline_ms",
    "skill_prior_ms",
    "num_moves",
    "solve_index",
]

def score_solve_profile_v2(db_session: Session, user: User, solve: Solve) -> Tuple[float, int | None, float, float, str]:
    """
    Returns:
      (ml_score_0_100, expected_time_ms, dnf_risk, plus2_risk, version_string)

    We do NOT retrain here. We only load an existing model and predict.
    """

    version = getattr(user, "active_model_version", "global_v2") or "global_v2"
    bundle = load_bundle_for_version(version)

    # If DNF or missing time -> hard score behavior
    eff = effective_time_ms(solve.time_ms, solve.penalty)
    if eff is None:
        # DNF score policy:
        # - expected time unknown
        # - DNF risk / +2 risk still can be predicted but isn't meaningful here
        return 0.0, None, 1.0, 0.0, version

    # Pull prior solves (limit to last ~80 to keep it fast)
    # We only need recent history to compute rolling stats.
    recent = (
        db_session.query(Solve)
        .filter(
            Solve.user_id == user.id,
            Solve.event == "3x3",
            Solve.id != solve.id,
            Solve.created_at <= solve.created_at,
        )
        .order_by(Solve.created_at.desc(), Solve.id.desc())
        .limit(80)
        .all()
    )

    # We fetched in reverse order; for rolling stats we want oldest->newest.
    recent = list(reversed(recent))

    history = []
    for s in recent:
        e = effective_time_ms(s.time_ms, s.penalty)
        if e is not None:
            history.append(e)

    solve_index = len(recent) + 1

    has_plus2 = 1 if solve.penalty == "+2" else 0
    skill_prior = user.get_skill_prior_ms()

    feats = build_features(
        effective_ms=eff,
        history_effective_times=history,
        skill_prior_ms=skill_prior,
        has_plus2=has_plus2,
        num_moves=solve.num_moves,
        solve_index=solve_index,
    )

    # Convert dict -> vector in correct feature order
    X = [[feats[k] for k in FEATURE_ORDER]]

    # Predict expected time
    expected_time = int(round(float(bundle["time_model"].predict(X)[0])))

    # Predict risks
    dnf_risk = float(bundle["dnf_model"].predict_proba(X)[0][1])
    plus2_risk = float(bundle["plus2_model"].predict_proba(X)[0][1])

    # Compute baseline (median of history or skill prior)
    baseline = baseline_median_ms(history, skill_prior)
    if baseline is None:
        baseline = float(skill_prior) if skill_prior is not None else float(eff)

    ratio = expected_time / float(baseline)
    ml_score = score_from_ratio(ratio)

    return ml_score, expected_time, dnf_risk, plus2_risk, version

import sys
print(sys.path)
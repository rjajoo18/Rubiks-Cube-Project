from __future__ import annotations
from typing import Optional

from sqlalchemy.orm import Session

from models import Solve, User
from ml.common.scoring_label import effective_time_ms
from ml.common.features import build_features
from ml.inference.model_loader import load_model_and_schema


def score_solve_gbm(db_session: Session, user: User, solve: Solve) -> tuple[float, str]:
    """
    Predict a 0-100 score for a given solve using the trained GBM model.
    Returns: (score, score_version)
    """
    eff = effective_time_ms(solve.time_ms, solve.penalty)

    # v1 policy: DNF gets a 0 score
    if eff is None:
        return 0.0, "gbm_v1"

    # Pull recent solves BEFORE this solve to build rolling stats
    recent = (
        db_session.query(Solve)
        .filter(
            Solve.user_id == user.id,
            Solve.event == "3x3",
            Solve.id != solve.id,
            Solve.created_at <= solve.created_at,
        )
        .order_by(Solve.created_at.asc(), Solve.id.asc())
        .all()
    )

    history = []
    for s in recent:
        e = effective_time_ms(s.time_ms, s.penalty)
        if e is not None:
            history.append(e)

    # solve_index = how many solves total (approx feature)
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

    model, schema = load_model_and_schema()
    feature_order = schema["features"]

    X = [[feats[f] for f in feature_order]]
    pred = float(model.predict(X)[0])

    pred = max(0.0, min(100.0, pred))
    return pred, "gbm_v1"

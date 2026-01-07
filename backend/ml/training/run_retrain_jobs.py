# ml/training/run_retrain_jobs.py

from __future__ import annotations

import os
import joblib
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from sklearn.model_selection import train_test_split
from sklearn.ensemble import HistGradientBoostingRegressor, HistGradientBoostingClassifier
from sklearn.metrics import mean_absolute_error

from models import User, Solve, MLRetrainJob
from ml.common.scoring_label import effective_time_ms, baseline_median_ms
from ml.common.features import build_features

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

def build_user_dataframe(session, user: User) -> pd.DataFrame:
    """
    Build a per-user training dataframe with features + labels.
    This is like build_dataset_v2, but only for one user and in-memory.
    """
    solves = (
        session.query(Solve)
        .filter(Solve.user_id == user.id, Solve.event == "3x3")
        .order_by(Solve.created_at.asc(), Solve.id.asc())
        .all()
    )

    skill_prior = user.get_skill_prior_ms()
    history = []
    solve_index = 0
    rows = []

    for s in solves:
        solve_index += 1

        y_dnf = 1 if s.penalty == "DNF" else 0
        y_plus2 = 1 if s.penalty == "+2" else 0

        eff = effective_time_ms(s.time_ms, s.penalty)
        if eff is None:
            continue

        baseline = baseline_median_ms(history, skill_prior)
        if baseline is None:
            baseline = float(skill_prior) if skill_prior is not None else float(eff)

        feats = build_features(
            effective_ms=eff,
            history_effective_times=history,
            skill_prior_ms=skill_prior,
            has_plus2=y_plus2,
            num_moves=s.num_moves,
            solve_index=solve_index,
        )

        row = {k: feats[k] for k in FEATURE_ORDER}
        row["y_time_ms"] = eff
        row["y_dnf"] = y_dnf
        row["y_plus2"] = y_plus2
        rows.append(row)

        history.append(eff)

    return pd.DataFrame(rows)

def main():
    db_url = os.environ.get("SQLALCHEMY_DATABASE_URI")
    if not db_url:
        raise RuntimeError("Set SQLALCHEMY_DATABASE_URI before running this script.")

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    # 1) Grab queued jobs
    jobs = (
        session.query(MLRetrainJob)
        .filter(MLRetrainJob.status == "queued")
        .order_by(MLRetrainJob.requested_at.asc())
        .limit(5)
        .all()
    )

    if not jobs:
        print("No queued retrain jobs.")
        return

    os.makedirs(os.path.join("ml", "artifacts", "users"), exist_ok=True)

    for job in jobs:
        user = session.query(User).filter(User.id == job.user_id).first()
        if not user:
            job.status = "failed"
            job.error = "User not found"
            job.finished_at = datetime.now(timezone.utc)
            session.commit()
            continue

        # Mark running
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        session.commit()

        try:
            df = build_user_dataframe(session, user)

            # Guardrail: need enough data
            if len(df) < 200:
                raise RuntimeError(f"Not enough user data to retrain safely (rows={len(df)}). Need >= 200.")

            X = df[FEATURE_ORDER].values
            y_time = df["y_time_ms"].values
            y_dnf = df["y_dnf"].values
            y_plus2 = df["y_plus2"].values

            X_train, X_val, y_time_train, y_time_val = train_test_split(X, y_time, test_size=0.2, random_state=42)
            _, _, y_dnf_train, _ = train_test_split(X, y_dnf, test_size=0.2, random_state=42)
            _, _, y_plus2_train, _ = train_test_split(X, y_plus2, test_size=0.2, random_state=42)

            # Train models
            time_model = HistGradientBoostingRegressor(
                learning_rate=0.08,
                max_depth=6,
                max_iter=400,
                min_samples_leaf=2,
                early_stopping=False,
                random_state=42,
            )
            time_model.fit(X_train, y_time_train)
            mae = mean_absolute_error(y_time_val, time_model.predict(X_val))

            dnf_model = HistGradientBoostingClassifier(
                learning_rate=0.08,
                max_depth=6,
                max_iter=300,
                min_samples_leaf=2,
                early_stopping=False,
                random_state=42,
            )
            dnf_model.fit(X_train, y_dnf_train)

            plus2_model = HistGradientBoostingClassifier(
                learning_rate=0.08,
                max_depth=6,
                max_iter=300,
                min_samples_leaf=2,
                early_stopping=False,
                random_state=42,
            )
            plus2_model.fit(X_train, y_plus2_train)

            # Simple gate: MAE must be sane
            # (You can later compare against global model; this is a first guardrail.)
            if mae <= 0 or mae > 20000:
                raise RuntimeError(f"MAE gate failed: {mae}")

            # Save model bundle
            version = f"user_{user.id}_v2"
            bundle = {
                "version": version,
                "time_model": time_model,
                "dnf_model": dnf_model,
                "plus2_model": plus2_model,
                "features": FEATURE_ORDER,
            }

            out_path = os.path.join("ml", "artifacts", "users", f"{version}.pkl")
            joblib.dump(bundle, out_path)

            # Promote model for this user
            user.active_model_version = version
            user.last_retrain_at = datetime.now(timezone.utc)

            job.status = "done"
            job.finished_at = datetime.now(timezone.utc)
            job.new_model_version = version

            session.commit()
            print(f"Trained + promoted {version} (MAE={mae:.2f})")

        except Exception as e:
            session.rollback()
            # Mark failed but keep app usable
            job = session.query(MLRetrainJob).filter(MLRetrainJob.id == job.id).first()
            job.status = "failed"
            job.error = str(e)
            job.finished_at = datetime.now(timezone.utc)
            session.commit()
            print(f"Job failed for user {job.user_id}: {e}")

if __name__ == "__main__":
    main()

from __future__ import annotations

import os
import csv

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import User, Solve

from ml.common.scoring_label import effective_time_ms, baseline_median_ms
from ml.common.features import build_features



# We will train multiple models, but they all share the SAME feature order.
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

def main():
    # 1) Read DB URL from env
    db_url = os.environ.get("SQLALCHEMY_DATABASE_URI")
    if not db_url:
        raise RuntimeError("Set SQLALCHEMY_DATABASE_URI before running this script.")

    # 2) Connect to DB with SQLAlchemy (standalone script, NOT using Flask app context)
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    # 3) Output CSV path
    out_dir = os.path.join("ml", "training", "datasets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "solves_training_v2.csv")

    # 4) Our dataset contains:
    # - identifiers (user_id, solve_id)
    # - features (FEATURE_ORDER)
    # - labels:
    #   y_time_ms  (regression target)
    #   y_dnf      (classification target)
    #   y_plus2    (classification target)
    fieldnames = ["user_id", "solve_id"] + FEATURE_ORDER + ["y_time_ms", "y_dnf", "y_plus2"]

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()

        users = session.query(User).all()
        total = 0

        for u in users:
            # "skill prior" is the WCA/self-reported average you stored on user
            skill_prior = u.get_skill_prior_ms()

            # Pull solves in chronological order to compute rolling features correctly
            solves = (
                session.query(Solve)
                .filter(Solve.user_id == u.id, Solve.event == "3x3")
                .order_by(Solve.created_at.asc(), Solve.id.asc())
                .all()
            )

            history_effective = []  # list of effective times of previous solves (DNFs excluded)
            solve_index = 0

            for s in solves:
                solve_index += 1

                # -------- Labels --------
                # y_dnf: 1 if this solve is DNF, else 0
                y_dnf = 1 if s.penalty == "DNF" else 0

                # y_plus2: 1 if this solve has +2 penalty, else 0
                y_plus2 = 1 if s.penalty == "+2" else 0

                # y_time_ms: effective time in ms (DNF -> None)
                eff = effective_time_ms(s.time_ms, s.penalty)

                # For time regression, we must SKIP DNFs and missing time
                if eff is None:
                    continue

                # baseline = median(last 50) else fallback to skill prior
                baseline = baseline_median_ms(history_effective, skill_prior)
                if baseline is None:
                    baseline = float(skill_prior) if skill_prior is not None else float(eff)

                # -------- Features --------
                feats = build_features(
                    effective_ms=eff,
                    history_effective_times=history_effective,
                    skill_prior_ms=skill_prior,
                    has_plus2=y_plus2,
                    num_moves=s.num_moves,
                    solve_index=solve_index,
                )

                # -------- Write row --------
                row = {"user_id": u.id, "solve_id": s.id}
                for k in FEATURE_ORDER:
                    row[k] = feats[k]

                row["y_time_ms"] = eff
                row["y_dnf"] = y_dnf
                row["y_plus2"] = y_plus2

                w.writerow(row)
                total += 1

                # IMPORTANT:
                # add this solve to history AFTER computing its features/labels,
                # otherwise we'd leak the solve into its own rolling statistics.
                history_effective.append(eff)

        print(f"Wrote {total} rows to {out_path}")

if __name__ == "__main__":
    main()

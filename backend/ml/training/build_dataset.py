from __future__ import annotations
import os
import csv

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import User, Solve
from ml.common.scoring_label import effective_time_ms, baseline_median_ms, compute_label_score
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

def main():
    db_url = os.environ.get("SQLALCHEMY_DATABASE_URI")
    if not db_url:
        raise RuntimeError("Set SQLALCHEMY_DATABASE_URI before running this script.")

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    out_dir = os.path.join("ml", "training", "datasets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "solves_training_v1.csv")

    fieldnames = ["user_id", "solve_id"] + FEATURE_ORDER + ["y_score"]

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()

        users = session.query(User).all()

        total = 0
        for u in users:
            skill_prior = u.get_skill_prior_ms()

            solves = (
                session.query(Solve)
                .filter(Solve.user_id == u.id, Solve.event == "3x3")
                .order_by(Solve.created_at.asc(), Solve.id.asc())
                .all()
            )

            history = []  # effective times of previous solves (DNFs excluded)
            solve_index = 0

            for s in solves:
                solve_index += 1

                eff = effective_time_ms(s.time_ms, s.penalty)
                if eff is None:
                    # skip DNFs / missing time in training v1
                    continue

                has_plus2 = 1 if s.penalty == "+2" else 0

                baseline = baseline_median_ms(history, skill_prior)
                if baseline is None:
                    baseline = float(skill_prior) if skill_prior is not None else float(eff)

                y = compute_label_score(eff, baseline)

                feats = build_features(
                    effective_ms=eff,
                    history_effective_times=history,
                    skill_prior_ms=skill_prior,
                    has_plus2=has_plus2,
                    num_moves=s.num_moves,
                    solve_index=solve_index,
                )

                row = {"user_id": u.id, "solve_id": s.id}
                for k in FEATURE_ORDER:
                    row[k] = feats[k]
                row["y_score"] = y

                w.writerow(row)
                total += 1

                # IMPORTANT: add to history AFTER building features/label
                history.append(eff)

        print(f"Wrote {total} rows to {out_path}")

if __name__ == "__main__":
    main()

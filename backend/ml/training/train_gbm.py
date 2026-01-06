# ml/training/train_gbm.py

from __future__ import annotations

import os
import json
import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
from sklearn.ensemble import HistGradientBoostingRegressor


# Where build_dataset.py writes the training data
DATA_PATH = os.path.join("ml", "training", "datasets", "solves_training_v1.csv")

# Where we save the trained model + schema
ARTIFACT_DIR = os.path.join("ml", "artifacts")
MODEL_PATH = os.path.join(ARTIFACT_DIR, "gbm_v1.pkl")
SCHEMA_PATH = os.path.join(ARTIFACT_DIR, "feature_schema.json")


# Must match FEATURE_ORDER in build_dataset.py
FEATURES = [
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

TARGET = "y_score"


def main():
    if not os.path.exists(DATA_PATH):
        raise RuntimeError(
            f"Training data not found at {DATA_PATH}. "
            f"Run: python -m ml.training.build_dataset"
        )

    os.makedirs(ARTIFACT_DIR, exist_ok=True)

    # 1) Load dataset
    df = pd.read_csv(DATA_PATH)

    print("Rows:", len(df))
    print("Unique y:", df["y_score"].nunique())
    print(df["y_score"].describe())


    # Basic sanity checks
    missing_cols = [c for c in (FEATURES + [TARGET]) if c not in df.columns]
    if missing_cols:
        raise RuntimeError(f"Missing columns in CSV: {missing_cols}")

    # 2) Handle missing values (should be rare, but safe)
    # - num_moves might be missing for many rows (we filled with 0 in features.py, but just in case)
    df["num_moves"] = df["num_moves"].fillna(0.0)

    # If skill_prior_ms somehow missing, fill it using baseline50_ms
    df["skill_prior_ms"] = df["skill_prior_ms"].fillna(df["baseline50_ms"])

    # std10_ms can be missing early; set to 0
    df["std10_ms"] = df["std10_ms"].fillna(0.0)

    # 3) Split into train/val
    X = df[FEATURES]
    y = df[TARGET]

    # Random split is fine for v1 (your label is deterministic anyway)
    X_train, X_val, y_train, y_val = train_test_split(
        X, y,
        test_size=0.2,
        random_state=42,
    )

    # 4) Fit a GBM regressor
    # HistGradientBoostingRegressor is a solid "GBM-style" baseline in sklearn.
    model = HistGradientBoostingRegressor(
        learning_rate=0.08,
        max_depth=6,
        max_iter=400,
        min_samples_leaf=2,
        l2_regularization=0.0,
        early_stopping=False,
        random_state=42,
    )

    model.fit(X_train, y_train)

    # 5) Print metric (MAE)
    preds = model.predict(X_val)
    mae = mean_absolute_error(y_val, preds)
    print(f"Validation MAE: {mae:.3f}")

    # 6) Save artifacts
    joblib.dump(model, MODEL_PATH)

    schema = {
        "version": "gbm_v1",
        "target": TARGET,
        "features": FEATURES,
        "dataset_path": DATA_PATH,
        "notes": {
            "label": "Option 2 personalized score vs baseline (ratio mapping)",
            "dnf_policy": "DNF excluded from training; inference returns 0 (v1)",
            "penalty_policy": "+2 adds 2000ms",
        },
    }
    with open(SCHEMA_PATH, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2)

    print(f"Saved model -> {MODEL_PATH}")
    print(f"Saved schema -> {SCHEMA_PATH}")


if __name__ == "__main__":
    main()

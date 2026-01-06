from __future__ import annotations

import os
import json
import joblib
import pandas as pd

from sklearn.metrics import mean_absolute_error

DATA_PATH = os.path.join("ml", "training", "datasets", "solves_training_v1.csv")
ARTIFACT_DIR = os.path.join("ml", "artifacts")
MODEL_PATH = os.path.join(ARTIFACT_DIR, "gbm_v1.pkl")
SCHEMA_PATH = os.path.join(ARTIFACT_DIR, "feature_schema.json")


def main():
    if not os.path.exists(DATA_PATH):
        raise RuntimeError(f"Missing dataset: {DATA_PATH}")
    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Missing model: {MODEL_PATH} (run train_gbm)")
    if not os.path.exists(SCHEMA_PATH):
        raise RuntimeError(f"Missing schema: {SCHEMA_PATH} (run train_gbm)")

    df = pd.read_csv(DATA_PATH)

    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)

    features = schema["features"]
    target = schema["target"]

    model = joblib.load(MODEL_PATH)

    X = df[features]
    y = df[target]

    preds = model.predict(X)

    mae = mean_absolute_error(y, preds)
    print(f"MAE on full dataset (rough): {mae:.3f}\n")

    sample = df[["user_id", "solve_id", "effective_time_ms", "baseline50_ms", "ratio_vs_baseline", "y_score"]].head(10).copy()
    sample["pred"] = preds[:10]
    print(sample.to_string(index=False))


if __name__ == "__main__":
    main()

from __future__ import annotations

import os
import json
import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.ensemble import HistGradientBoostingRegressor, HistGradientBoostingClassifier
from sklearn.metrics import mean_absolute_error, roc_auc_score

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
    # 1) Read dataset CSV written by build_dataset_v2.py
    csv_path = os.path.join("ml", "training", "datasets", "solves_training_v2.csv")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found: {csv_path}. Run build_dataset_v2 first.")

    df = pd.read_csv(csv_path)

    # 2) Ensure numeric types (guards against CSV weirdness)
    for c in FEATURE_ORDER + ["y_time_ms", "y_dnf", "y_plus2"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df = df.dropna(subset=FEATURE_ORDER + ["y_time_ms", "y_dnf", "y_plus2"])

    X = df[FEATURE_ORDER].values
    y_time = df["y_time_ms"].values
    y_dnf = df["y_dnf"].values
    y_plus2 = df["y_plus2"].values

    # 3) Split into train/val so we can evaluate sanity before saving
    X_train, X_val, y_time_train, y_time_val = train_test_split(X, y_time, test_size=0.2, random_state=42)
    _, _, y_dnf_train, y_dnf_val = train_test_split(X, y_dnf, test_size=0.2, random_state=42)
    _, _, y_plus2_train, y_plus2_val = train_test_split(X, y_plus2, test_size=0.2, random_state=42)

    # 4) Train time regressor
    time_model = HistGradientBoostingRegressor(
        learning_rate=0.08,
        max_depth=6,
        max_iter=400,
        min_samples_leaf=2,
        early_stopping=False,
        random_state=42,
    )
    time_model.fit(X_train, y_time_train)
    pred_time = time_model.predict(X_val)
    mae = mean_absolute_error(y_time_val, pred_time)
    print(f"[time_model] MAE(ms) on val: {mae:.2f}")

    # 5) Train DNF classifier
    dnf_model = HistGradientBoostingClassifier(
        learning_rate=0.08,
        max_depth=6,
        max_iter=300,
        min_samples_leaf=2,
        early_stopping=False,
        random_state=42,
    )
    dnf_model.fit(X_train, y_dnf_train)

    # AUC only makes sense if both classes exist in val
    dnf_auc = None
    if len(set(y_dnf_val.tolist())) == 2:
        dnf_auc = roc_auc_score(y_dnf_val, dnf_model.predict_proba(X_val)[:, 1])
        print(f"[dnf_model] AUC on val: {dnf_auc:.3f}")
    else:
        print("[dnf_model] AUC skipped (val set has only one class)")

    # 6) Train +2 classifier
    plus2_model = HistGradientBoostingClassifier(
        learning_rate=0.08,
        max_depth=6,
        max_iter=300,
        min_samples_leaf=2,
        early_stopping=False,
        random_state=42,
    )
    plus2_model.fit(X_train, y_plus2_train)

    plus2_auc = None
    if len(set(y_plus2_val.tolist())) == 2:
        plus2_auc = roc_auc_score(y_plus2_val, plus2_model.predict_proba(X_val)[:, 1])
        print(f"[plus2_model] AUC on val: {plus2_auc:.3f}")
    else:
        print("[plus2_model] AUC skipped (val set has only one class)")

    # 7) Save artifact bundle (model objects + metadata)
    os.makedirs(os.path.join("ml", "artifacts"), exist_ok=True)

    bundle = {
        "version": "global_v2",
        "time_model": time_model,
        "dnf_model": dnf_model,
        "plus2_model": plus2_model,
        "features": FEATURE_ORDER,
    }

    bundle_path = os.path.join("ml", "artifacts", "bundle_v2.pkl")
    joblib.dump(bundle, bundle_path)

    schema = {
        "version": "global_v2",
        "features": FEATURE_ORDER,
        "labels": ["y_time_ms", "y_dnf", "y_plus2"],
        "notes": "Time regressor + DNF/+2 classifiers. Score computed from predicted time vs baseline.",
    }
    schema_path = os.path.join("ml", "artifacts", "feature_schema_v2.json")
    with open(schema_path, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2)

    print(f"Saved bundle: {bundle_path}")
    print(f"Saved schema: {schema_path}")

if __name__ == "__main__":
    main()

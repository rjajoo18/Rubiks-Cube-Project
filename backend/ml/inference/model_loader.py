from __future__ import annotations
import os
import json
import joblib
from functools import lru_cache

ARTIFACT_DIR = os.path.join("ml", "artifacts")

@lru_cache(maxsize=1)
def load_model_and_schema():
    """
    Load model + schema once and cache it.
    This prevents reloading the model on every request.
    """
    model_path = os.path.join(ARTIFACT_DIR, "gbm_v1.pkl")
    schema_path = os.path.join(ARTIFACT_DIR, "feature_schema.json")

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Missing model artifact: {model_path}")
    if not os.path.exists(schema_path):
        raise FileNotFoundError(f"Missing schema artifact: {schema_path}")

    model = joblib.load(model_path)
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    return model, schema

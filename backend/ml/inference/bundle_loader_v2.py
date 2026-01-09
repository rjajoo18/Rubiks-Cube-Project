from __future__ import annotations
import os
import joblib
from functools import lru_cache

@lru_cache(maxsize=8)
def load_bundle_for_version(version: str):
    """
    Load a model bundle by version and cache it.

    - Caching matters because model loading from disk is slow.
    - maxsize=64 lets you cache multiple user models.
    """

    # Global model path
    if version == "global_v2":
        path = os.path.join("ml", "artifacts", "bundle_v2.pkl")
    else:
        # Per-user models stored here:
        # ml/artifacts/users/user_2_v2.pkl, etc.
        path = os.path.join("ml", "artifacts", "users", f"{version}.pkl")

    if not os.path.exists(path):
        # If user-specific model missing, fall back to global
        fallback = os.path.join("ml", "artifacts", "bundle_v2.pkl")
        return joblib.load(fallback)

    return joblib.load(path)

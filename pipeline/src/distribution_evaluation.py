"""Evaluation module for destination inventory 6-bucket distribution models (DATA-5.1A).

Evaluates 20 canonical combinations (4 horizons x 5 required bike counts)
on test split data, verifying 6-bucket model compliance, probability ranges,
monotonicity, and deterministic output formatting.
"""

from __future__ import annotations

import pandas as pd
import numpy as np

from pipeline.src.quantity_distribution import (
    HORIZONS,
    QUANTITIES,
    validate_distribution_records,
    _feature_frame,
    tail_probabilities,
)

REQUIRED_SPLIT = "test"


def evaluate_distribution_model(model_artifact, records):
    """Evaluate a trained 6-bucket distribution model on test split records.

    Parameters
    ----------
    model_artifact : dict
        Model artifact dictionary containing 'model', 'feature_columns', and
        'bucket_definition' (must be '0,1,2,3,4,5+').
    records : list of dict or pd.DataFrame
        Records dataframe containing station, feature_as_of, current_bike_count,
        horizon_minutes, future_bike_count, and split.

    Returns
    -------
    list of dict
        Exactly 20 evaluated result rows, each containing:
        - horizonMinutes
        - requiredBikeCount
        - sampleCount
        - observedSuccessRate
        - brierScore
    """
    # 1. Verify model is current 6-bucket model
    if not isinstance(model_artifact, dict) or "model" not in model_artifact:
        raise ValueError("Invalid model artifact: must be a dict with a 'model' key")

    bucket_def = model_artifact.get("bucket_definition")
    model_obj = model_artifact["model"]
    classes = getattr(model_obj, "classes_", None)

    if bucket_def != "0,1,2,3,4,5+" or classes is None or len(classes) != 6:
        raise ValueError("Rejected: model artifact must be a 6-bucket distribution model (0,1,2,3,4,5+)")

    # 2. Validate records and verify test split
    frame = validate_distribution_records(records)
    splits = set(frame["split"].unique())
    if splits != {REQUIRED_SPLIT}:
        raise ValueError(f"Rejected: data must contain only '{REQUIRED_SPLIT}' split records, got {splits}")

    features = _feature_frame(frame).reindex(columns=model_artifact["feature_columns"], fill_value=0.0)
    tails = tail_probabilities(model_obj.predict_proba(features), classes)

    # 4. Verify probabilities are in [0, 1] and monotonicity holds (probabilities non-increasing with quantity)
    if (tails < 0.0).any() or (tails > 1.0).any():
        raise ValueError("Rejected: predicted probabilities must be within [0.0, 1.0]")

    diffs = np.diff(tails, axis=1)  # Difference between quantity k+1 and k should be <= 0
    if (diffs > 1e-9).any():
        raise ValueError("Rejected: monotonicity violation detected (probability increased for larger quantity)")

    # 3 & 5. Compute metrics for all 20 canonical combinations
    actual_future = frame["future_bike_count"].to_numpy()
    results = []

    for horizon in HORIZONS:
        horizon_mask = (frame["horizon_minutes"] == horizon).to_numpy()
        if not np.any(horizon_mask):
            raise ValueError(f"Rejected: missing records for horizon_minutes={horizon}")

        for q_idx, quantity in enumerate(QUANTITIES):
            sub_mask = horizon_mask
            sub_tails = tails[sub_mask, q_idx]
            sub_actual = actual_future[sub_mask]

            sample_count = int(len(sub_actual))
            if sample_count == 0:
                raise ValueError(f"Rejected: empty sample for horizon={horizon}, quantity={quantity}")

            actual_binary = (sub_actual >= quantity).astype(float)
            observed_success_rate = float(np.mean(actual_binary))
            brier_score = float(np.mean((sub_tails - actual_binary) ** 2))

            results.append({
                "horizonMinutes": int(horizon),
                "requiredBikeCount": int(quantity),
                "sampleCount": sample_count,
                "observedSuccessRate": round(observed_success_rate, 4),
                "brierScore": round(brier_score, 4),
            })

    if len(results) != 20:
        raise ValueError(f"Rejected: expected exactly 20 combination results, got {len(results)}")

    return results

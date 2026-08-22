"""Predict destination inventory as a six-bucket distribution.

The public prediction contract still exposes ``P(inventory >= n)`` for
``n=1..5``.  Those values are derived from one distribution instead of five
independent binary classifiers, so their ordering needs no post-processing.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier


HORIZONS = (60, 120, 180, 240)
QUANTITIES = (1, 2, 3, 4, 5)
FEATURE_COLUMNS = (
    "station_id",
    "day_of_week",
    "hour_of_day",
    "month",
    "is_weekend",
    "current_bike_count",
    "horizon_minutes",
)
REQUIRED_COLUMNS = {
    "station_id",
    "feature_as_of",
    "current_bike_count",
    "horizon_minutes",
    "future_bike_count",
    "split",
}


def cap_inventory_bucket(count):
    """Map an observed count to 0, 1, 2, 3, 4, or the 5+ bucket."""
    return np.clip(pd.to_numeric(count, errors="raise").astype(int), 0, 5)


def validate_distribution_records(records):
    frame = records.copy() if isinstance(records, pd.DataFrame) else pd.DataFrame(records)
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"records missing: {sorted(missing)}")
    if frame.empty:
        raise ValueError("distribution records must not be empty")
    if not set(frame["horizon_minutes"]).issubset(HORIZONS):
        raise ValueError("records have unsupported horizon_minutes")
    if not set(frame["split"]).issubset({"train", "validation", "test"}):
        raise ValueError("records have unsupported split")
    if (pd.to_numeric(frame["current_bike_count"], errors="raise") < 0).any():
        raise ValueError("records current_bike_count must be non-negative")
    if (pd.to_numeric(frame["future_bike_count"], errors="raise") < 0).any():
        raise ValueError("records future_bike_count must be non-negative")
    return frame


def distribution_records_from_labels(labeled):
    """Convert DATA-2.1 wide labels into one non-leaking distribution row per horizon."""
    rows = []
    for horizon in (1, 2, 3, 4):
        valid = labeled.get(f"target_valid_h{horizon}")
        future = labeled.get(f"future_bike_count_h{horizon}")
        if valid is None or future is None:
            raise ValueError(f"labeled data missing H{horizon} future count or validity")
        frame = labeled.loc[valid.astype(bool), ["station_id", "feature_as_of", "current_bike_count", "split"]].copy()
        frame["horizon_minutes"] = horizon * 60
        frame["future_bike_count"] = future.loc[frame.index]
        rows.append(frame)
    return validate_distribution_records(pd.concat(rows, ignore_index=True))


def distribution_records_from_tail_labels(labeled, split):
    """Convert existing H1~H4 x 1~5 tail labels into capped inventory buckets."""
    rows = []
    for horizon in (1, 2, 3, 4):
        valid = labeled.get(f"target_valid_h{horizon}")
        labels = [labeled.get(f"label_h{horizon}_t{quantity}") for quantity in QUANTITIES]
        if valid is None or any(label is None for label in labels):
            raise ValueError(f"labeled data missing H{horizon} tail labels or validity")
        frame = labeled.loc[valid.astype(bool), ["station_id", "feature_as_of", "current_bike_count"]].copy()
        frame["horizon_minutes"] = horizon * 60
        frame["future_bike_count"] = labeled.loc[frame.index, [
            f"label_h{horizon}_t{quantity}" for quantity in QUANTITIES
        ]].sum(axis=1)
        frame["split"] = split
        rows.append(frame)
    return validate_distribution_records(pd.concat(rows, ignore_index=True))


def _feature_frame(frame):
    result = frame.copy()
    if "feature_as_of" in result:
        timestamp = pd.to_datetime(result["feature_as_of"], utc=True).dt.tz_convert("Asia/Seoul")
        result["day_of_week"] = timestamp.dt.dayofweek
        result["hour_of_day"] = timestamp.dt.hour
        result["month"] = timestamp.dt.month
        result["is_weekend"] = (result["day_of_week"] >= 5).astype(int)
    result["station_id"] = _station_code(result["station_id"])
    return result.loc[:, FEATURE_COLUMNS].astype(float)


def _station_code(station_ids):
    """Keep the existing numeric station feature without a dense one-hot matrix."""
    numeric = pd.to_numeric(station_ids, errors="coerce")
    missing = numeric.isna()
    if missing.any():
        numeric.loc[missing] = station_ids.loc[missing].astype(str).map(
            lambda value: int(hashlib.sha256(value.encode("utf-8")).hexdigest()[:12], 16)
        )
    return numeric


def _encode_train_and_score(train_features, score_features):
    return train_features, score_features.reindex(columns=train_features.columns, fill_value=0.0)


def tail_probabilities(class_probabilities, classes):
    """Return P(>=1)..P(>=5) from 0..5 bucket probabilities."""
    matrix = np.zeros((len(class_probabilities), 6), dtype=float)
    matrix[:, np.asarray(classes, dtype=int)] = class_probabilities
    return np.column_stack([matrix[:, quantity:].sum(axis=1) for quantity in QUANTITIES])


def brier_scores_for_tails(actual_buckets, tails):
    actual = np.asarray(actual_buckets, dtype=int)
    return {
        f"atLeast{quantity}": float(np.mean((tails[:, quantity - 1] - (actual >= quantity)) ** 2))
        for quantity in QUANTITIES
    }


def train_distribution_model(records, target_split="validation", random_seed=20260810):
    """Train only on chronological train rows and score validation/test rows."""
    frame = validate_distribution_records(records)
    train = frame[frame["split"] == "train"].copy()
    score = frame[frame["split"] == target_split].copy()
    if train.empty or score.empty:
        raise ValueError("train and target split must both contain rows")

    x_train, _ = _encode_train_and_score(_feature_frame(train), _feature_frame(score))
    y_train = cap_inventory_bucket(train["future_bike_count"])
    model = HistGradientBoostingClassifier(random_state=random_seed)
    model.fit(x_train, y_train)
    artifact = {
        "model": model,
        "feature_columns": list(x_train.columns),
        "model_name": "hist_gradient_boosting_inventory_distribution",
        "bucket_definition": "0,1,2,3,4,5+",
    }
    return artifact, evaluate_distribution_artifact(artifact, score)


def evaluate_distribution_artifact(artifact, records):
    """Score an already-trained artifact without fitting on the score split."""
    frame = validate_distribution_records(records)
    features = _feature_frame(frame).reindex(columns=artifact["feature_columns"], fill_value=0.0)
    tails = tail_probabilities(artifact["model"].predict_proba(features), artifact["model"].classes_)
    actual = cap_inventory_bucket(frame["future_bike_count"])
    return {
        "tails": tails,
        "actual_buckets": actual.to_numpy(),
        "brier_scores": brier_scores_for_tails(actual, tails),
        "row_count": len(frame),
    }


def write_artifact_bundle(artifact, manifest, output_directory):
    """Write a private joblib artifact with a JSON manifest and SHA-256 file."""
    import joblib

    output = Path(output_directory)
    output.mkdir(parents=True, exist_ok=True)
    artifact_path = output / "model.joblib"
    manifest_path = output / "model_manifest.json"
    checksum_path = output / "SHA256SUMS"
    joblib.dump(artifact, artifact_path)
    artifact_sha256 = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    documented = {**manifest, "artifact_sha256": artifact_sha256}
    manifest_path.write_text(json.dumps(documented, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest_sha256 = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    checksum_path.write_text(
        f"{artifact_sha256}  {artifact_path.name}\n{manifest_sha256}  {manifest_path.name}\n",
        encoding="utf-8",
    )
    return {
        "artifact_path": artifact_path,
        "manifest_path": manifest_path,
        "checksum_path": checksum_path,
        "artifact_sha256": artifact_sha256,
        "manifest_sha256": manifest_sha256,
    }


def make_distribution_predictor(artifact):
    """Adapt one distribution model to DATA-3.2's existing 20-row predictor input."""
    model = artifact["model"]
    feature_columns = artifact["feature_columns"]

    def predict(feature_rows):
        frame = pd.DataFrame(feature_rows)
        required = set(FEATURE_COLUMNS) | {"required_bike_count"}
        missing = required - set(frame.columns)
        if missing:
            raise ValueError(f"feature rows missing: {sorted(missing)}")
        base_columns = list(FEATURE_COLUMNS)
        unique = frame.drop_duplicates(base_columns, keep="first")
        encoded = _feature_frame(unique.loc[:, FEATURE_COLUMNS])
        encoded = encoded.reindex(columns=feature_columns, fill_value=0.0)
        tails = tail_probabilities(model.predict_proba(encoded), model.classes_)
        lookup = {
            tuple(row[column] for column in base_columns): tails[index]
            for index, (_, row) in enumerate(unique.iterrows())
        }
        values = []
        for _, row in frame.iterrows():
            quantity = int(row["required_bike_count"])
            if quantity not in QUANTITIES:
                raise ValueError("required_bike_count must be 1..5")
            key = tuple(row[column] for column in base_columns)
            values.append(float(lookup[key][quantity - 1]))
        return values

    return predict

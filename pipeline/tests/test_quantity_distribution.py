import numpy as np
import pandas as pd

from pipeline.src.batch_inference import run_batch_inference
from pipeline.src.quantity_distribution import (
    distribution_records_from_labels,
    distribution_records_from_tail_labels,
    make_distribution_predictor,
    tail_probabilities,
    train_distribution_model,
)


def _records():
    rows = []
    for split, hour in (("train", 8), ("train", 9), ("validation", 10), ("test", 11)):
        for station, current, future in (("A", 1, 1), ("B", 5, 5), ("C", 2, 3), ("D", 0, 0)):
            for horizon in (60, 120, 180, 240):
                rows.append({
                    "station_id": station,
                    "feature_as_of": f"2025-01-02T{hour:02d}:00:00Z",
                    "current_bike_count": current,
                    "horizon_minutes": horizon,
                    "future_bike_count": future,
                    "split": split,
                })
    return pd.DataFrame(rows)


def test_distribution_tails_are_monotonic_and_derived_from_buckets():
    tails = tail_probabilities(np.array([[0.05, 0.08, 0.09, 0.06, 0.07, 0.65]]), np.arange(6))
    assert np.allclose(tails[0], [0.95, 0.87, 0.78, 0.72, 0.65])
    assert np.all(tails[:, :-1] >= tails[:, 1:])


def test_distribution_training_and_existing_batch_adapter_agree():
    artifact, evaluation = train_distribution_model(_records())
    assert evaluation["row_count"] == 16
    assert set(evaluation["brier_scores"]) == {"atLeast1", "atLeast2", "atLeast3", "atLeast4", "atLeast5"}
    predictor = make_distribution_predictor(artifact)
    feature_rows = [
        {
            "station_id": "A", "current_bike_count": 1, "day_of_week": 3,
            "hour_of_day": 10, "month": 1, "is_weekend": 0,
            "horizon_minutes": 60, "required_bike_count": quantity,
        }
        for quantity in range(1, 6)
    ]
    probabilities = predictor(feature_rows)
    assert all(left >= right for left, right in zip(probabilities, probabilities[1:]))
    batch = run_batch_inference([
        {
            "stationId": "A", "featureAsOf": "2025-01-02T10:00:00Z",
            "currentBikeCount": 1, "modelVersion": "distribution-test",
            "inputManifestHash": "a" * 64,
        }
    ], predictor=predictor, generated_at="2025-01-02T10:05:00Z")
    assert batch["publishable"] is True
    assert batch["rowCount"] == 20
    h1 = [row["probability"] for row in batch["rows"] if row["horizonMinutes"] == 60]
    assert all(left >= right for left, right in zip(h1, h1[1:]))
    assert artifact["feature_columns"] == list(artifact["model"].feature_names_in_)


def test_distribution_records_keep_one_row_per_valid_horizon():
    labeled = pd.DataFrame({
        "station_id": ["A"], "feature_as_of": ["2025-01-01T00:00:00Z"],
        "current_bike_count": [2], "split": ["train"],
        **{f"target_valid_h{h}": [True] for h in range(1, 5)},
        **{f"future_bike_count_h{h}": [h] for h in range(1, 5)},
    })
    records = distribution_records_from_labels(labeled)
    assert records["horizon_minutes"].tolist() == [60, 120, 180, 240]
    assert records["future_bike_count"].tolist() == [1, 2, 3, 4]


def test_distribution_records_can_reuse_existing_tail_labels():
    labeled = pd.DataFrame({
        "station_id": ["A"], "feature_as_of": ["2025-01-01T00:00:00Z"],
        "current_bike_count": [2],
        **{f"target_valid_h{h}": [True] for h in range(1, 5)},
        **{f"label_h{h}_t{q}": [q <= h] for h in range(1, 5) for q in range(1, 6)},
    })
    records = distribution_records_from_tail_labels(labeled, "train")
    assert records["future_bike_count"].tolist() == [1, 2, 3, 4]

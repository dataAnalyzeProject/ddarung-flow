"""DATA-3.1 model-comparison starter contract.

The validation helpers are ready. The assignee implements only the functions
marked TODO(DATA-3.1), then enables the skipped tests in test_modeling.py.
"""

import json
from pathlib import Path


HORIZON_MINUTES = (60, 120, 180, 240)
REQUIRED_BIKE_COUNTS = (1, 2, 3, 4, 5)
SPLITS = ("train", "validation", "test")
REQUIRED_RECORD_KEYS = {
    "station_id",
    "feature_as_of",
    "current_bike_count",
    "horizon_minutes",
    "required_bike_count",
    "target",
    "split",
}
FORBIDDEN_FEATURES = {
    "user_latitude",
    "user_longitude",
    "origin",
    "destination",
    "distance_meters",
    "duration_seconds",
    "actual_arrival_at",
    "future_bike_count",
    "future_observation_valid",
    "weather",
    "rainfall",
}


def load_json(path):
    with Path(path).open(encoding="utf-8") as file:
        return json.load(file)


def validate_records(records):
    """Fail early when the fixed modeling contract is violated."""
    if not records:
        raise ValueError("modeling records must not be empty")

    for index, record in enumerate(records):
        missing = REQUIRED_RECORD_KEYS - set(record)
        if missing:
            raise ValueError(f"record {index} is missing: {sorted(missing)}")

        forbidden = FORBIDDEN_FEATURES & set(record)
        if forbidden:
            raise ValueError(f"record {index} has forbidden fields: {sorted(forbidden)}")

        if record["horizon_minutes"] not in HORIZON_MINUTES:
            raise ValueError(f"record {index} has unsupported horizon_minutes")
        if record["required_bike_count"] not in REQUIRED_BIKE_COUNTS:
            raise ValueError(f"record {index} has unsupported required_bike_count")
        if record["split"] not in SPLITS:
            raise ValueError(f"record {index} has unsupported split")
        if record["target"] not in (0, 1):
            raise ValueError(f"record {index} target must be 0 or 1")
        if record["current_bike_count"] < 0:
            raise ValueError(f"record {index} current_bike_count must be non-negative")

    return records


def build_feature_matrix(records, config):
    """TODO(DATA-3.1): return X, y, and row identifiers without leakage."""
    raise NotImplementedError("DATA-3.1 assignee implements build_feature_matrix")


def train_and_evaluate(records, config):
    """TODO(DATA-3.1): compare all required models on identical evaluation rows."""
    raise NotImplementedError("DATA-3.1 assignee implements train_and_evaluate")


def enforce_quantity_monotonicity(predictions):
    """TODO(DATA-3.1): ensure P(>=1) >= ... >= P(>=5) per row group."""
    raise NotImplementedError(
        "DATA-3.1 assignee implements enforce_quantity_monotonicity"
    )

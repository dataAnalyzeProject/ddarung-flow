"""Unit tests for pipeline/src/distribution_evaluation.py (DATA-5.1A)."""

import json
from pathlib import Path
import pytest
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

import pipeline.src.distribution_evaluation as distribution_evaluation
from pipeline.src.distribution_evaluation import evaluate_distribution_model
from pipeline.src.quantity_distribution import train_distribution_model

FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "distribution_evaluation_records.json"
)


class DummyBinaryModel:
    """Old binary classifier model mock."""
    classes_ = np.array([0, 1])

    def predict_proba(self, X):
        return np.tile([0.3, 0.7], (len(X), 1))


class InvalidProbModel:
    """Mock model returning invalid probabilities outside [0, 1]."""
    classes_ = np.array([0, 1, 2, 3, 4, 5])

    def predict_proba(self, X):
        return np.tile([-0.1, 0.2, 0.2, 0.2, 0.2, 0.3], (len(X), 1))


class MonotonicityViolatingModel:
    """Mock model returning class probabilities that cause monotonicity violations."""
    classes_ = np.array([0, 1, 2, 3, 4, 5])

    def predict_proba(self, X):
        # Class probabilities: bucket 0 has 0.0 prob, bucket 5 has 0.9 prob -> P(>=5) > P(>=1)
        return np.tile([0.0, 0.01, 0.01, 0.01, 0.01, 0.96], (len(X), 1))


@pytest.fixture
def test_records():
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def trained_distribution_artifact(test_records):
    # Create train and test records for training a real 6-bucket artifact
    records = []
    for r in test_records:
        train_r = dict(r)
        train_r["split"] = "train"
        records.append(train_r)
        records.append(dict(r))

    artifact, _ = train_distribution_model(records, target_split="test", random_seed=20260810)
    return artifact


def test_normal_test_split_returns_exactly_20_rows(trained_distribution_artifact, test_records):
    results = evaluate_distribution_model(trained_distribution_artifact, test_records)
    assert isinstance(results, list)
    assert len(results) == 20
    for row in results:
        assert "horizonMinutes" in row
        assert "requiredBikeCount" in row
        assert "sampleCount" in row
        assert "observedSuccessRate" in row
        assert "brierScore" in row
        assert row["horizonMinutes"] in (60, 120, 180, 240)
        assert row["requiredBikeCount"] in (1, 2, 3, 4, 5)
        assert row["sampleCount"] > 0
        assert 0.0 <= row["observedSuccessRate"] <= 1.0
        assert 0.0 <= row["brierScore"] <= 1.0


def test_rejects_old_binary_classifier_model(test_records):
    binary_artifact = {
        "model": DummyBinaryModel(),
        "feature_columns": ["station_id", "day_of_week", "hour_of_day", "month", "is_weekend", "current_bike_count", "horizon_minutes"],
        "bucket_definition": "binary_0_1",
    }
    with pytest.raises(ValueError, match="Rejected: model artifact must be a 6-bucket distribution model"):
        evaluate_distribution_model(binary_artifact, test_records)


def test_fails_if_any_horizon_combination_missing(trained_distribution_artifact, test_records):
    # Remove all horizon 240 records
    incomplete_records = [r for r in test_records if r["horizon_minutes"] != 240]
    with pytest.raises(ValueError, match="Rejected: missing records for horizon_minutes=240"):
        evaluate_distribution_model(trained_distribution_artifact, incomplete_records)


def test_fails_if_probability_out_of_bounds(test_records):
    invalid_artifact = {
        "model": InvalidProbModel(),
        "feature_columns": ["station_id", "day_of_week", "hour_of_day", "month", "is_weekend", "current_bike_count", "horizon_minutes"],
        "bucket_definition": "0,1,2,3,4,5+",
    }
    with pytest.raises(ValueError, match="Rejected: predicted probabilities must be within"):
        evaluate_distribution_model(invalid_artifact, test_records)


def test_fails_if_monotonicity_violated(trained_distribution_artifact, test_records, monkeypatch):
    bad_tails = np.tile(np.array([0.80, 0.90, 0.60, 0.40, 0.20]), (len(test_records), 1))
    monkeypatch.setattr(distribution_evaluation, "tail_probabilities", lambda _probabilities, _classes: bad_tails)
    with pytest.raises(ValueError, match="monotonicity violation"):
        distribution_evaluation.evaluate_distribution_model(trained_distribution_artifact, test_records)


def test_fails_if_non_test_split_provided(trained_distribution_artifact, test_records):
    validation_records = [dict(r, split="validation") for r in test_records]
    with pytest.raises(ValueError, match="Rejected: data must contain only 'test' split records"):
        evaluate_distribution_model(trained_distribution_artifact, validation_records)


def test_evaluation_is_deterministic(trained_distribution_artifact, test_records):
    run1 = evaluate_distribution_model(trained_distribution_artifact, test_records)
    run2 = evaluate_distribution_model(trained_distribution_artifact, test_records)
    assert run1 == run2

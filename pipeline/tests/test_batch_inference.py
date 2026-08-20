"""Unit test suite for DATA-3.2 batch inference pipeline and quality audit."""

import json
from pathlib import Path

import pandas as pd
import pytest

from pipeline.src.batch_inference import run_batch_inference
from pipeline.src.quality.prediction_batch_quality import validate_prediction_batch

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "batch_inference_sample.json"


def _mock_valid_predictor(features):
    """Mock predictor returning valid non-increasing probabilities (0.9..0.5)."""
    probs = []
    for f in features:
        qty = f["required_bike_count"]
        # Base prob decreases as required quantity increases
        base_prob = 0.95 - (qty * 0.08)
        probs.append(round(base_prob, 4))
    return probs


def _mock_monotonicity_violating_predictor(features):
    """Mock predictor returning invalid probability (increases for qty 5)."""
    probs = []
    for f in features:
        qty = f["required_bike_count"]
        if qty == 5:
            probs.append(0.99)  # Monotonicity violation: P(>=5) > P(>=1)
        else:
            probs.append(round(0.80 - qty * 0.05, 4))
    return probs


def _mock_range_violating_predictor(features):
    """Mock predictor returning out-of-range probability (1.5)."""
    probs = []
    for f in features:
        probs.append(1.5)  # Invalid: > 1.0
    return probs


def _mock_failing_predictor(features):
    """Mock predictor that raises an exception."""
    raise RuntimeError("Model file corrupted or inference engine crashed")


def test_batch_inference_normal_40_rows():
    """Verify normal execution with 2 stations producing exactly 40 publishable rows."""
    with FIXTURE_PATH.open(encoding="utf-8") as file:
        inputs = json.load(file)

    res = run_batch_inference(inputs, predictor=_mock_valid_predictor, generated_at="2026-08-14T10:05:00Z")

    assert res["publishable"] is True
    assert res["rowCount"] == 40
    assert len(res["rows"]) == 40
    assert len(res["errors"]) == 0
    assert res["batchId"].startswith("batch-")
    assert len(res["sha256Hash"]) == 64

    # Verify sorting: ST-10 comes before ST-20
    assert res["rows"][0]["stationId"] == "ST-10"
    assert res["rows"][20]["stationId"] == "ST-20"


def test_batch_inference_omission_check():
    """Verify quality validation flags missing station/horizon combinations."""
    sample_rows = [
        {
            "stationId": "ST-10",
            "featureAsOf": "2026-08-14T10:00:00Z",
            "predictionTargetAt": "2026-08-14T11:00:00Z",
            "horizonMinutes": 60,
            "requiredBikeCount": 1,
            "probability": 0.8,
            "modelVersion": "v1",
        }
    ]
    errors = validate_prediction_batch(sample_rows, expected_station_ids={"ST-10", "ST-20"})
    assert any("missing_expected_stations" in err for err in errors)
    assert any("missing_horizons" in err for err in errors)


def test_batch_inference_duplication_check():
    """Verify quality validation flags duplicate composite keys."""
    row = {
        "stationId": "ST-10",
        "featureAsOf": "2026-08-14T10:00:00Z",
        "predictionTargetAt": "2026-08-14T11:00:00Z",
        "horizonMinutes": 60,
        "requiredBikeCount": 1,
        "probability": 0.8,
        "modelVersion": "v1",
    }
    sample_rows = [row, row]
    errors = validate_prediction_batch(sample_rows)
    assert any("duplicate_key" in err for err in errors)


def test_batch_inference_range_violation():
    """Verify execution with out-of-range probabilities returns publishable=False."""
    with FIXTURE_PATH.open(encoding="utf-8") as file:
        inputs = json.load(file)

    res = run_batch_inference(inputs, predictor=_mock_range_violating_predictor, generated_at="2026-08-14T10:05:00Z")

    assert res["publishable"] is False
    assert any("range_violation" in err for err in res["errors"])


def test_batch_inference_monotonicity_violation():
    """Verify execution with non-monotonic probabilities returns publishable=False."""
    with FIXTURE_PATH.open(encoding="utf-8") as file:
        inputs = json.load(file)

    res = run_batch_inference(
        inputs, predictor=_mock_monotonicity_violating_predictor, generated_at="2026-08-14T10:05:00Z"
    )

    assert res["publishable"] is False
    assert any("monotonicity_violation" in err for err in res["errors"])


def test_batch_inference_timestamp_mismatch():
    """Verify quality validation flags target time calculation mismatches."""
    sample_rows = [
        {
            "stationId": "ST-10",
            "featureAsOf": "2026-08-14T10:00:00Z",
            "predictionTargetAt": "2026-08-14T15:00:00Z",  # Wrong! Should be 11:00:00
            "horizonMinutes": 60,
            "requiredBikeCount": 1,
            "probability": 0.8,
            "modelVersion": "v1",
        }
    ]
    errors = validate_prediction_batch(sample_rows)
    assert any("timestamp_mismatch" in err for err in errors)


def test_batch_inference_predictor_exception():
    """Verify predictor exception sets publishable=False and records error without crashing."""
    with FIXTURE_PATH.open(encoding="utf-8") as file:
        inputs = json.load(file)

    res = run_batch_inference(inputs, predictor=_mock_failing_predictor, generated_at="2026-08-14T10:05:00Z")

    assert res["publishable"] is False
    assert any("predictor_exception" in err for err in res["errors"])
    assert res["rows"][0]["dataStatus"] == "INVALID"


def test_batch_inference_rerun_sha256_hash_identity():
    """Verify exact SHA-256 hash identity across re-runs with identical seed/input/modelVersion."""
    with FIXTURE_PATH.open(encoding="utf-8") as file:
        inputs = json.load(file)

    res1 = run_batch_inference(inputs, predictor=_mock_valid_predictor, generated_at="2026-08-14T10:00:00Z")
    res2 = run_batch_inference(inputs, predictor=_mock_valid_predictor, generated_at="2026-08-14T10:00:00Z")

    assert res1["publishable"] is True
    assert res2["publishable"] is True
    assert res1["batchId"] == res2["batchId"]
    assert res1["sha256Hash"] == res2["sha256Hash"]


def test_batch_inference_dataframe_input_and_empty_guard():
    """Assignee additional test: DataFrame input handling and empty input guard."""
    with FIXTURE_PATH.open(encoding="utf-8") as file:
        inputs_list = json.load(file)

    df_inputs = pd.DataFrame(inputs_list)
    res_df = run_batch_inference(df_inputs, predictor=_mock_valid_predictor, generated_at="2026-08-14T10:00:00Z")
    assert res_df["publishable"] is True
    assert res_df["rowCount"] == 40

    # Guard against empty input
    res_empty = run_batch_inference([], predictor=_mock_valid_predictor)
    assert res_empty["publishable"] is False
    assert "empty_inputs" in res_empty["errors"]


class DummyPredictorModel:
    def predict_proba(self, X):
        import numpy as np
        if hasattr(X, "columns") and "required_bike_count" in X.columns:
            qty = X["required_bike_count"].values
            probs = 0.95 - (qty * 0.08)
        else:
            probs = np.full(len(X), 0.8)
        return np.column_stack([1.0 - probs, probs])



def test_trusted_predictor_normal_and_failure_modes(tmp_path):
    """Verify build_trusted_predictor normal execution and failure guards (missing file, SHA mismatch, missing column)."""
    import joblib
    from pipeline.src.batch_inference import build_trusted_predictor
    from pipeline.src.modeling import sha256_file

    artifact_path = tmp_path / "test_model.joblib"
    joblib.dump(DummyPredictorModel(), artifact_path)
    real_sha = sha256_file(artifact_path)


    feature_cols = ["station_id", "current_bike_count", "day_of_week", "hour_of_day", "month", "is_weekend", "horizon_minutes", "required_bike_count"]

    predictor = build_trusted_predictor(artifact_path, real_sha, feature_cols)

    with FIXTURE_PATH.open(encoding="utf-8") as file:
        inputs = json.load(file)

    res = run_batch_inference(inputs, predictor=predictor, generated_at="2026-08-14T10:00:00Z")
    assert res["publishable"] is True
    assert res["rowCount"] == 40
    assert res["rows"][0]["probability"] == 0.87


    # Failure mode 1: Artifact file missing
    missing_path = tmp_path / "missing.joblib"
    with pytest.raises(RuntimeError, match="not found"):
        build_trusted_predictor(missing_path, real_sha, feature_cols)

    # Failure mode 2: SHA mismatch
    with pytest.raises(RuntimeError, match="SHA-256 does not match"):
        build_trusted_predictor(artifact_path, "0" * 64, feature_cols)

    # Failure mode 3: Missing required feature column in row
    bad_predictor = build_trusted_predictor(artifact_path, real_sha, ["missing_col_xyz"])
    with pytest.raises(RuntimeError, match="missing required feature columns"):
        bad_predictor([{"current_bike_count": 5}])


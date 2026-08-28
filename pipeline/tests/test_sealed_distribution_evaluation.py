"""Unit tests for pipeline/src/sealed_distribution_evaluation.py (DATA-5.2)."""

import hashlib
import json
from pathlib import Path
import pytest
import numpy as np
import pandas as pd
import joblib

import pipeline.src.sealed_distribution_evaluation as sealed_eval
from pipeline.src.sealed_distribution_evaluation import (
    evaluate_sealed_distribution_records,
    validate_pre_evaluation_integrity,
    run_sealed_evaluation,
    EXPECTED_ARTIFACT_SHA256,
    EXPECTED_MANIFEST_SHA256,
    EXPECTED_SEALED_INPUT_SHA256,
    EXPECTED_RAW_MANIFEST_SHA256,
    REQUIRED_MODEL_VERSION,
    REQUIRED_BUCKET_DEFINITION,
)
from pipeline.src.quantity_distribution import train_distribution_model

FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "distribution_evaluation_records.json"
)


class DummyBinaryModel:
    """Mock binary classifier with only 2 classes."""
    classes_ = np.array([0, 1])

    def predict_proba(self, X):
        return np.tile([0.3, 0.7], (len(X), 1))


class InvalidProbModel:
    """Mock model returning probabilities outside [0, 1]."""
    classes_ = np.array([0, 1, 2, 3, 4, 5])

    def predict_proba(self, X):
        return np.tile([-0.1, 0.2, 0.2, 0.2, 0.2, 0.3], (len(X), 1))


@pytest.fixture
def test_records():
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def trained_distribution_artifact(test_records):
    records = []
    for r in test_records:
        train_r = dict(r)
        train_r["split"] = "train"
        records.append(train_r)
        records.append(dict(r))

    artifact, _ = train_distribution_model(records, target_split="test", random_seed=20260810)
    return artifact


def test_normal_evaluation_returns_20_rows(trained_distribution_artifact, test_records):
    results = evaluate_sealed_distribution_records(trained_distribution_artifact, test_records)
    assert isinstance(results, list)
    assert len(results) == 20
    for row in results:
        assert "horizonMinutes" in row
        assert "requiredBikeCount" in row
        assert "sampleCount" in row
        assert "successCount" in row
        assert "deficitCount" in row
        assert "brierScore" in row
        assert "accuracy" in row
        assert "deficitRecall" in row
        assert "calibrationError" in row
        assert "probabilityMin" in row
        assert "probabilityMax" in row

        assert row["horizonMinutes"] in (60, 120, 180, 240)
        assert row["requiredBikeCount"] in (1, 2, 3, 4, 5)
        assert row["sampleCount"] == row["successCount"] + row["deficitCount"]
        assert 0.0 <= row["brierScore"] <= 1.0
        assert 0.0 <= row["accuracy"] <= 1.0
        assert 0.0 <= row["calibrationError"] <= 1.0
        assert 0.0 <= row["probabilityMin"] <= row["probabilityMax"] <= 1.0
        if isinstance(row["deficitRecall"], (int, float)):
            assert 0.0 <= row["deficitRecall"] <= 1.0


def test_rejects_binary_two_class_model(test_records):
    binary_artifact = {
        "model": DummyBinaryModel(),
        "feature_columns": ["station_id", "day_of_week", "hour_of_day", "month", "is_weekend", "current_bike_count", "horizon_minutes"],
        "bucket_definition": "0,1,2,3,4,5+",
    }
    with pytest.raises(ValueError, match="must be a 6-bucket distribution model"):
        evaluate_sealed_distribution_records(binary_artifact, test_records)


def test_rejects_invalid_bucket_definition(test_records):
    invalid_artifact = {
        "model": DummyBinaryModel(),
        "feature_columns": ["station_id", "day_of_week", "hour_of_day", "month", "is_weekend", "current_bike_count", "horizon_minutes"],
        "bucket_definition": "binary_0_1",
    }
    with pytest.raises(ValueError, match="must be a 6-bucket distribution model"):
        evaluate_sealed_distribution_records(invalid_artifact, test_records)


def test_rejects_missing_horizon(trained_distribution_artifact, test_records):
    incomplete_records = [r for r in test_records if r["horizon_minutes"] != 240]
    with pytest.raises(ValueError, match="missing records for horizon_minutes=240"):
        evaluate_sealed_distribution_records(trained_distribution_artifact, incomplete_records)


def test_rejects_out_of_bounds_probability(test_records):
    invalid_artifact = {
        "model": InvalidProbModel(),
        "feature_columns": ["station_id", "day_of_week", "hour_of_day", "month", "is_weekend", "current_bike_count", "horizon_minutes"],
        "bucket_definition": "0,1,2,3,4,5+",
    }
    with pytest.raises(ValueError, match="predicted probabilities must be within"):
        evaluate_sealed_distribution_records(invalid_artifact, test_records)


def test_rejects_monotonicity_violation(trained_distribution_artifact, test_records, monkeypatch):
    bad_tails = np.tile(np.array([0.80, 0.90, 0.60, 0.40, 0.20]), (len(test_records), 1))
    monkeypatch.setattr(sealed_eval, "tail_probabilities", lambda _probabilities, _classes: bad_tails)
    with pytest.raises(ValueError, match="monotonicity violation"):
        evaluate_sealed_distribution_records(trained_distribution_artifact, test_records)


def test_deficit_recall_not_evaluable_when_zero_deficit(trained_distribution_artifact, test_records):
    # Set future_bike_count to 10 for all records (all successes for required quantity 1)
    all_success_records = [dict(r, future_bike_count=10) for r in test_records]
    results = evaluate_sealed_distribution_records(trained_distribution_artifact, all_success_records)
    for row in results:
        if row["requiredBikeCount"] == 1:
            assert row["deficitCount"] == 0
            assert row["deficitRecall"] == "NOT_EVALUABLE"
            assert "deficitRecallReason" in row


def test_evaluation_is_deterministic(trained_distribution_artifact, test_records):
    run1 = evaluate_sealed_distribution_records(trained_distribution_artifact, test_records)
    run2 = evaluate_sealed_distribution_records(trained_distribution_artifact, test_records)
    assert run1 == run2


def test_pre_validation_checks_hashes_and_metadata(tmp_path):
    artifact_file = tmp_path / "model.joblib"
    manifest_file = tmp_path / "model_manifest.json"
    sealed_file = tmp_path / "test_wide_labels.parquet"

    artifact_file.write_bytes(b"dummy_model_bytes")
    sealed_file.write_bytes(b"dummy_sealed_bytes")

    art_sha = hashlib.sha256(artifact_file.read_bytes()).hexdigest()
    sealed_sha = hashlib.sha256(sealed_file.read_bytes()).hexdigest()

    manifest_dict = {
        "model_version": REQUIRED_MODEL_VERSION,
        "bucket_definition": REQUIRED_BUCKET_DEFINITION,
        "input_manifest_sha256": EXPECTED_RAW_MANIFEST_SHA256,
        "artifact_sha256": art_sha,
    }
    manifest_file.write_text(json.dumps(manifest_dict), encoding="utf-8")
    man_sha = hashlib.sha256(manifest_file.read_bytes()).hexdigest()

    # Success case
    manifest_data = validate_pre_evaluation_integrity(
        artifact_path=artifact_file,
        manifest_path=manifest_file,
        sealed_input_path=sealed_file,
        expected_artifact_sha=art_sha,
        expected_manifest_sha=man_sha,
        expected_sealed_input_sha=sealed_sha,
    )
    assert manifest_data["model_version"] == REQUIRED_MODEL_VERSION

    # Mismatched artifact SHA
    with pytest.raises(ValueError, match="Artifact SHA-256 mismatch"):
        validate_pre_evaluation_integrity(
            artifact_path=artifact_file,
            manifest_path=manifest_file,
            sealed_input_path=sealed_file,
            expected_artifact_sha="wrong_sha",
            expected_manifest_sha=man_sha,
            expected_sealed_input_sha=sealed_sha,
        )

    # Mismatched sealed input SHA
    with pytest.raises(ValueError, match="Sealed input SHA-256 mismatch"):
        validate_pre_evaluation_integrity(
            artifact_path=artifact_file,
            manifest_path=manifest_file,
            sealed_input_path=sealed_file,
            expected_artifact_sha=art_sha,
            expected_manifest_sha=man_sha,
            expected_sealed_input_sha="wrong_sha",
        )

    # Manifest metadata invalid model_version
    bad_manifest_file = tmp_path / "bad_manifest.json"
    bad_manifest_dict = {**manifest_dict, "model_version": "invalid_version"}
    bad_manifest_file.write_text(json.dumps(bad_manifest_dict), encoding="utf-8")
    bad_man_sha = hashlib.sha256(bad_manifest_file.read_bytes()).hexdigest()

    with pytest.raises(ValueError, match="Manifest model_version mismatch"):
        validate_pre_evaluation_integrity(
            artifact_path=artifact_file,
            manifest_path=bad_manifest_file,
            sealed_input_path=sealed_file,
            expected_artifact_sha=art_sha,
            expected_manifest_sha=bad_man_sha,
            expected_sealed_input_sha=sealed_sha,
        )


def test_end_to_end_sealed_evaluation_bundle(tmp_path, trained_distribution_artifact, test_records):
    # Create valid mock wide-label parquet dataframe from test_records
    rows = []
    # Build tail labels mock
    for idx, r in enumerate(test_records):
        row = {
            "station_id": r["station_id"],
            "feature_as_of": r["feature_as_of"],
            "current_bike_count": r["current_bike_count"],
        }
        for h in (1, 2, 3, 4):
            # Mark even index H4 as target_valid=False to verify invalid rows are filtered out
            row[f"target_valid_h{h}"] = not (h == 4 and idx % 2 == 0)
            fut = r["future_bike_count"]
            for q in (1, 2, 3, 4, 5):
                row[f"label_h{h}_t{q}"] = 1 if fut >= q else 0
        rows.append(row)

    wide_df = pd.DataFrame(rows)
    parquet_path = tmp_path / "test_wide_labels.parquet"
    wide_df.to_parquet(parquet_path)
    parquet_sha = hashlib.sha256(parquet_path.read_bytes()).hexdigest()

    artifact_path = tmp_path / "model.joblib"
    joblib.dump(trained_distribution_artifact, artifact_path)
    artifact_sha = hashlib.sha256(artifact_path.read_bytes()).hexdigest()

    manifest_path = tmp_path / "model_manifest.json"
    manifest_dict = {
        "model_version": REQUIRED_MODEL_VERSION,
        "bucket_definition": REQUIRED_BUCKET_DEFINITION,
        "input_manifest_sha256": EXPECTED_RAW_MANIFEST_SHA256,
        "artifact_sha256": artifact_sha,
    }
    manifest_path.write_text(json.dumps(manifest_dict), encoding="utf-8")
    manifest_sha = hashlib.sha256(manifest_path.read_bytes()).hexdigest()

    output_dir = tmp_path / "evidence_output"
    result = run_sealed_evaluation(
        artifact_path=artifact_path,
        manifest_path=manifest_path,
        sealed_input_path=parquet_path,
        output_dir=output_dir,
        expected_artifact_sha=artifact_sha,
        expected_manifest_sha=manifest_sha,
        expected_sealed_input_sha=parquet_sha,
    )

    assert result["evaluated_combinations"] == 20
    results_file = Path(result["results_path"])
    summary_file = Path(result["summary_path"])
    manifest_file = Path(result["manifest_path"])
    checksum_file = Path(result["checksum_path"])

    assert results_file.exists()
    assert results_file.name == "DATA-5.2_20-combination-results.json"
    assert summary_file.exists()
    assert summary_file.name == "DATA-5.2_sealed-evaluation-summary.md"
    assert manifest_file.exists()
    assert manifest_file.name == "DATA-5.2_sealed-input-manifest.json"
    assert checksum_file.exists()
    assert checksum_file.name == "SHA256SUMS"

    comb_data = json.loads(results_file.read_text(encoding="utf-8"))
    assert len(comb_data) == 20

    summary_text = summary_file.read_text(encoding="utf-8")
    assert "DATA-5.2" in summary_text
    assert "reconstructed historical test" in summary_text

    manifest_data = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert manifest_data["task_id"] == "DATA-5.2"
    assert manifest_data["test_dataset_label"] == "reconstructed historical test"

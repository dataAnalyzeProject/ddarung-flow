import copy
import json
from pathlib import Path

import pytest

from pipeline.src.modeling import (
    build_feature_matrix,
    evaluate_predictions,
    enforce_quantity_monotonicity,
    load_trusted_artifact,
    load_json,
    sha256_file,
    train_and_evaluate,
    validate_records,
    write_model_manifest,
)


ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "pipeline" / "config" / "modeling.json"
FIXTURE_PATH = ROOT / "pipeline" / "tests" / "fixtures" / "modeling_sample.json"


def records_with_complete_test_grid():
    records = load_json(FIXTURE_PATH)
    template = next(row for row in records if row["split"] == "test")
    records = [row for row in records if row["split"] != "test"]
    for horizon in (60, 120, 180, 240):
        for quantity in (1, 2, 3, 4, 5):
            row = copy.deepcopy(template)
            row["station_id"] = f"GRID-{horizon}"
            row["horizon_minutes"] = horizon
            row["required_bike_count"] = quantity
            row["target"] = int(quantity <= 3)
            records.append(row)
    return records


def test_fixed_config_matches_approved_contract():
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    assert config["random_seed"] == 20260810
    assert config["horizon_minutes"] == [60, 120, 180, 240]
    assert config["required_bike_counts"] == [1, 2, 3, 4, 5]
    assert config["primary_metric"] == "brier_score"
    assert config["approved_model"] == "hist_gradient_boosting"
    assert config["artifact_format"] == "joblib"
    assert config["validation_policy"]["test_holdout_must_not_be_read_during_selection"]


def test_fixed_fixture_passes_record_validation():
    records = load_json(FIXTURE_PATH)
    assert validate_records(records) == records
    assert {row["split"] for row in records} == {"train", "validation", "test"}


def test_future_and_route_fields_are_rejected():
    records = load_json(FIXTURE_PATH)
    invalid = copy.deepcopy(records)
    invalid[0]["future_bike_count"] = 4
    invalid[0]["distance_meters"] = 120
    with pytest.raises(ValueError, match="forbidden fields"):
        validate_records(invalid)


def test_unsupported_horizon_and_quantity_are_rejected():
    records = load_json(FIXTURE_PATH)
    invalid_horizon = copy.deepcopy(records)
    invalid_horizon[0]["horizon_minutes"] = 90
    with pytest.raises(ValueError, match="unsupported horizon_minutes"):
        validate_records(invalid_horizon)

    invalid_quantity = copy.deepcopy(records)
    invalid_quantity[0]["required_bike_count"] = 6
    with pytest.raises(ValueError, match="unsupported required_bike_count"):
        validate_records(invalid_quantity)


def test_feature_matrix_contains_only_approved_features():
    records = load_json(FIXTURE_PATH)
    config = load_json(CONFIG_PATH)
    features, target, row_ids = build_feature_matrix(records, config)
    assert set(features.columns) <= set(config["allowed_features"])
    assert len(features) == len(target) == len(row_ids)


def test_all_models_use_identical_evaluation_rows():
    records = load_json(FIXTURE_PATH)
    config = load_json(CONFIG_PATH)
    result = train_and_evaluate(records, config)
    assert result["evaluation_row_hash"].nunique() == 1
    assert set(result["model"]) == set(config["models"])


def test_quantity_probabilities_are_monotonic():
    predictions = [0.82, 0.76, 0.79, 0.51, 0.42]
    fixed = enforce_quantity_monotonicity(predictions)
    assert all(left >= right for left, right in zip(fixed, fixed[1:]))
    assert all(0.0 <= value <= 1.0 for value in fixed)


def test_model_import_failure_raises_runtime_error(monkeypatch):
    records = load_json(FIXTURE_PATH)
    config = load_json(CONFIG_PATH)

    import builtins
    real_import = builtins.__import__

    def mock_import(name, *args, **kwargs):
        if "sklearn" in name:
            raise ImportError("No module named 'sklearn'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", mock_import)

    with pytest.raises(RuntimeError, match=r"\[Model Execution Failed\] Stage: IMPORT"):
        train_and_evaluate(records, config)


def test_model_fit_failure_raises_runtime_error(monkeypatch):
    records = load_json(FIXTURE_PATH)
    config = load_json(CONFIG_PATH)

    from sklearn.ensemble import HistGradientBoostingClassifier

    def mock_fit(self, X, y):
        raise ValueError("Simulated fit failure")

    monkeypatch.setattr(HistGradientBoostingClassifier, "fit", mock_fit)

    with pytest.raises(RuntimeError, match=r"\[Model Execution Failed\] Stage: FIT"):
        train_and_evaluate(records, config)


def test_model_predict_failure_raises_runtime_error(monkeypatch):
    records = load_json(FIXTURE_PATH)
    config = load_json(CONFIG_PATH)

    from sklearn.ensemble import HistGradientBoostingClassifier

    def mock_predict_proba(self, X):
        raise RuntimeError("Simulated predict failure")

    monkeypatch.setattr(HistGradientBoostingClassifier, "predict_proba", mock_predict_proba)

    with pytest.raises(RuntimeError, match=r"\[Model Execution Failed\] Stage: PREDICT"):
        train_and_evaluate(records, config)


def test_artifact_save_failure_raises_runtime_error(monkeypatch):
    records = load_json(FIXTURE_PATH)
    config = load_json(CONFIG_PATH)

    import joblib

    def mock_dump(*args, **kwargs):
        raise OSError("Permission denied for artifact saving")

    monkeypatch.setattr(joblib, "dump", mock_dump)

    with pytest.raises(RuntimeError, match=r"\[Model Execution Failed\] Stage: ARTIFACT_SAVE"):
        train_and_evaluate(
            records,
            config,
            target_split="test",
            model_names=["hist_gradient_boosting"],
            artifact_path="output/model_winner.joblib",
        )


def test_real_prediction_monotonicity_audit_and_enforcement():
    records = load_json(FIXTURE_PATH)
    config = load_json(CONFIG_PATH)

    results = train_and_evaluate(records, config, target_split="validation")
    assert "total_groups" in results.columns
    assert "violations_before" in results.columns
    assert "violations_after" in results.columns
    assert (results["violations_after"] == 0).all()
    assert (results["total_groups"] > 0).all()


def test_sealed_test_runs_only_selected_hist_model(tmp_path):
    records = records_with_complete_test_grid()
    config = load_json(CONFIG_PATH)
    artifact_path = tmp_path / "model_winner.joblib"
    results = train_and_evaluate(
        records,
        config,
        target_split="test",
        model_names=["hist_gradient_boosting"],
        artifact_path=artifact_path,
    )
    assert results["model"].tolist() == ["hist_gradient_boosting"]
    assert artifact_path.exists()


def test_sealed_predictions_produce_unique_20_combination_table():
    records = records_with_complete_test_grid()
    config = load_json(CONFIG_PATH)
    results = train_and_evaluate(
        records, config, target_split="test", model_names=["hist_gradient_boosting"]
    )
    horizons, combinations = evaluate_predictions(
        results.attrs["eval_df"], results.attrs["predictions"]["hist_gradient_boosting"]
    )
    assert horizons["segment"].tolist() == ["H1", "H2", "H3", "H4"]
    assert len(combinations) == 20
    assert combinations["combination"].nunique() == 20


def test_unknown_selected_model_fails():
    records = load_json(FIXTURE_PATH)
    config = load_json(CONFIG_PATH)
    with pytest.raises(ValueError, match="Unsupported model_name"):
        train_and_evaluate(records, config, target_split="test", model_names=["unknown"])


def test_manifest_matches_hist_artifact_and_checksum(tmp_path):
    records = records_with_complete_test_grid()
    config = load_json(CONFIG_PATH)
    artifact_path = tmp_path / "model_winner.joblib"
    manifest_path = tmp_path / "model_winner_metadata.json"
    results = train_and_evaluate(
        records,
        config,
        target_split="test",
        model_names=["hist_gradient_boosting"],
        artifact_path=artifact_path,
    )
    horizons, combinations = evaluate_predictions(
        results.attrs["eval_df"], results.attrs["predictions"]["hist_gradient_boosting"]
    )
    manifest = write_model_manifest(
        manifest_path, artifact_path, config, "test-sha", "a" * 64,
        results, horizons, combinations,
    )
    assert manifest["model_class"] == "sklearn.ensemble.HistGradientBoostingClassifier"
    assert manifest["artifact_sha256"] == sha256_file(artifact_path)
    assert len(manifest["combination_metrics"]) == 20
    loaded = load_trusted_artifact(artifact_path, manifest["artifact_sha256"])
    assert loaded["model_name"] == "hist_gradient_boosting"
    with pytest.raises(RuntimeError, match="SHA-256"):
        load_trusted_artifact(artifact_path, "0" * 64)


def test_inference_isolation_rejects_forbidden_features():
    """Verify that forbidden future/route fields are rejected and not mixed into artifact inference."""
    from pipeline.src.modeling import FORBIDDEN_FEATURES, validate_records

    records = load_json(FIXTURE_PATH)
    forbidden_sample_cols = [
        "user_latitude",
        "user_longitude",
        "origin",
        "destination",
        "distance_meters",
        "duration_seconds",
        "future_bike_count",
    ]

    for col in forbidden_sample_cols:
        assert col in FORBIDDEN_FEATURES
        bad_records = copy.deepcopy(records)
        bad_records[0][col] = 123
        with pytest.raises(ValueError, match="forbidden fields"):
            validate_records(bad_records)


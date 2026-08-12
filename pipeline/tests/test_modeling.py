import copy
import json
from pathlib import Path

import pytest

from pipeline.src.modeling import (
    build_feature_matrix,
    enforce_quantity_monotonicity,
    load_json,
    train_and_evaluate,
    validate_records,
)


ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "pipeline" / "config" / "modeling.json"
FIXTURE_PATH = ROOT / "pipeline" / "tests" / "fixtures" / "modeling_sample.json"


def test_fixed_config_matches_approved_contract():
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    assert config["random_seed"] == 20260810
    assert config["horizon_minutes"] == [60, 120, 180, 240]
    assert config["required_bike_counts"] == [1, 2, 3, 4, 5]
    assert config["primary_metric"] == "brier_score"
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
        train_and_evaluate(records, config)


def test_real_prediction_monotonicity_audit_and_enforcement():
    records = load_json(FIXTURE_PATH)
    config = load_json(CONFIG_PATH)

    results = train_and_evaluate(records, config, target_split="validation")
    assert "total_groups" in results.columns
    assert "violations_before" in results.columns
    assert "violations_after" in results.columns
    assert (results["violations_after"] == 0).all()
    assert (results["total_groups"] > 0).all()

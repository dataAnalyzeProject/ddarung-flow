"""Unit tests for model inference module (pipeline/src/modelops/inference.py).

Covering 5 required test scenarios:
1. Normal inference with valid inputs
2. Input missing required fields
3. Invalid data types in inputs
4. Missing model artifact file
5. Reproducibility with identical inputs
"""

import os
from pathlib import Path
import pytest

from pipeline.src.modelops.inference import (
    map_probability_to_availability_level,
    predict_availability,
    validate_inference_input,
)


def test_map_probability_to_availability_level():
    """Verify availability level mapping thresholds."""
    assert map_probability_to_availability_level(0.85) == "HIGH"
    assert map_probability_to_availability_level(0.75) == "HIGH"
    assert map_probability_to_availability_level(0.60) == "MEDIUM"
    assert map_probability_to_availability_level(0.50) == "MEDIUM"
    assert map_probability_to_availability_level(0.35) == "LOW"
    assert map_probability_to_availability_level(0.25) == "LOW"
    assert map_probability_to_availability_level(0.10) == "SHORTAGE"


def test_inference_normal():
    """Scenario 1: Normal inference with valid inputs returns SUCCESS."""
    valid_input = {
        "stationId": "ST-101",
        "arrivalAt": "2026-08-19T14:00:00+09:00",
        "features": {"currentBikeCount": 5, "temperature": 25.4},
    }
    # Mock predictor returning fixed probability 0.85
    mock_predictor = lambda data: 0.85

    result = predict_availability(valid_input, predictor_override=mock_predictor)

    assert result["status"] == "SUCCESS"
    assert result["stationId"] == "ST-101"
    assert result["arrivalAt"] == "2026-08-19T14:00:00+09:00"
    assert result["availabilityLevel"] == "HIGH"
    assert result["probability"] == 0.85


def test_inference_missing_input():
    """Scenario 2: Missing required input keys returns FAILED status with explicit error message."""
    # Missing stationId
    missing_station = {
        "arrivalAt": "2026-08-19T14:00:00+09:00",
    }
    res1 = predict_availability(missing_station, predictor_override=lambda x: 0.8)
    assert res1["status"] == "FAILED"
    assert res1["availabilityLevel"] is None
    assert res1["probability"] is None
    assert "Missing required key" in res1["errorMessage"]

    # Missing arrivalAt
    missing_arrival = {
        "stationId": "ST-101",
    }
    res2 = predict_availability(missing_arrival, predictor_override=lambda x: 0.8)
    assert res2["status"] == "FAILED"
    assert res2["errorMessage"] is not None


def test_inference_type_error():
    """Scenario 3: Invalid data types yield explicit FAILED status."""
    # Empty / whitespace stationId
    bad_station = {
        "stationId": "   ",
        "arrivalAt": "2026-08-19T14:00:00+09:00",
    }
    res1 = predict_availability(bad_station, predictor_override=lambda x: 0.8)
    assert res1["status"] == "FAILED"
    assert "Invalid stationId" in res1["errorMessage"]

    # Invalid timestamp format
    bad_time = {
        "stationId": "ST-101",
        "arrivalAt": "invalid-datetime-string",
    }
    res2 = predict_availability(bad_time, predictor_override=lambda x: 0.8)
    assert res2["status"] == "FAILED"
    assert "Invalid arrivalAt timestamp format" in res2["errorMessage"]

    # Invalid feature type
    bad_features = {
        "stationId": "ST-101",
        "arrivalAt": "2026-08-19T14:00:00+09:00",
        "features": {"temp": "not_a_number"},
    }
    res3 = predict_availability(bad_features, predictor_override=lambda x: 0.8)
    assert res3["status"] == "FAILED"
    assert "non-numeric type" in res3["errorMessage"]


def test_inference_missing_artifact(tmp_path):
    """Scenario 4: Missing artifact file returns FAILED status without crashing."""
    valid_input = {
        "stationId": "ST-101",
        "arrivalAt": "2026-08-19T14:00:00+09:00",
    }
    non_existent_path = tmp_path / "non_existent_model.joblib"

    result = predict_availability(valid_input, model_path=non_existent_path)

    assert result["status"] == "FAILED"
    assert result["availabilityLevel"] is None
    assert result["probability"] is None
    assert "Model artifact not found" in result["errorMessage"]


def test_inference_reproducibility():
    """Scenario 5: Identical inputs yield deterministic, identical outputs."""
    valid_input = {
        "stationId": "ST-105",
        "arrivalAt": "2026-08-19T15:30:00+09:00",
        "features": {"currentBikeCount": 3},
    }

    # Predictor with deterministic output
    predictor = lambda d: 0.6234

    run1 = predict_availability(valid_input, predictor_override=predictor)
    run2 = predict_availability(valid_input, predictor_override=predictor)

    assert run1["status"] == "SUCCESS"
    assert run2["status"] == "SUCCESS"
    assert run1 == run2
    assert run1["probability"] == run2["probability"]
    assert run1["availabilityLevel"] == run2["availabilityLevel"]

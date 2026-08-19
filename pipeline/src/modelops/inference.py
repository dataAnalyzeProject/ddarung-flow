"""Pure model inference input validation, prediction execution, and output contract formatting."""

from datetime import datetime
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

REQUIRED_KEYS = ("stationId", "arrivalAt")


def _is_valid_iso_datetime(val: Any) -> bool:
    """Validate whether input is a valid ISO datetime string or datetime object."""
    if isinstance(val, datetime):
        return True
    if not isinstance(val, str) or not val.strip():
        return False
    try:
        iso_str = val.replace("Z", "+00:00")
        datetime.fromisoformat(iso_str)
        return True
    except (ValueError, TypeError):
        return False


def validate_inference_input(input_data: Any) -> Tuple[bool, Optional[str]]:
    """Validate inference input dictionary for required keys, data types, and timestamps.

    Returns (True, None) if valid, or (False, "error message") if invalid.
    """
    if not isinstance(input_data, dict):
        return False, "Input data must be a dictionary"

    for key in REQUIRED_KEYS:
        if key not in input_data or input_data[key] is None:
            return False, f"Missing required key: '{key}'"

    station_id = input_data["stationId"]
    if not isinstance(station_id, (str, int)) or str(station_id).strip() == "":
        return False, f"Invalid stationId type or value: {station_id}"

    arrival_at = input_data["arrivalAt"]
    if not _is_valid_iso_datetime(arrival_at):
        return False, f"Invalid arrivalAt timestamp format: {arrival_at}"

    # Validate feature values if feature dictionary or numeric values are supplied
    if "features" in input_data:
        features = input_data["features"]
        if not isinstance(features, (dict, list)):
            return False, "Field 'features' must be a dictionary or list of numeric values"
        if isinstance(features, dict):
            for f_name, f_val in features.items():
                if f_val is not None and not isinstance(f_val, (int, float, bool)):
                    return False, f"Feature '{f_name}' has non-numeric type: {type(f_val)}"

    return True, None


def map_probability_to_availability_level(probability: float) -> str:
    """Map predicted probability (0.0 - 1.0) to availability level status."""
    if probability >= 0.75:
        return "HIGH"
    elif probability >= 0.50:
        return "MEDIUM"
    elif probability >= 0.25:
        return "LOW"
    else:
        return "SHORTAGE"


def predict_availability(
    input_data: Any,
    model_path: Optional[Union[str, Path]] = None,
    predictor_override: Optional[Any] = None,
) -> Dict[str, Any]:
    """Execute model inference and return formatted output contract.

    Args:
        input_data: Dict containing stationId, arrivalAt, and optional features.
        model_path: Optional path to joblib model file (default: output/model_winner.joblib).
        predictor_override: Optional callable for testing deterministic inference.

    Returns:
        Dict with keys: stationId, arrivalAt, availabilityLevel, probability, status, errorMessage (if failed).
    """
    # Extract stationId and arrivalAt safely for response
    st_id = input_data.get("stationId") if isinstance(input_data, dict) else None
    arr_at = input_data.get("arrivalAt") if isinstance(input_data, dict) else None

    # Step 1: Input Validation
    is_valid, error_msg = validate_inference_input(input_data)
    if not is_valid:
        return {
            "stationId": str(st_id) if st_id is not None else None,
            "arrivalAt": str(arr_at) if arr_at is not None else None,
            "availabilityLevel": None,
            "probability": None,
            "status": "FAILED",
            "errorMessage": error_msg,
        }

    # Step 2: Model Artifact Verification
    if predictor_override is None:
        target_path = Path(model_path) if model_path else Path("output/model_winner.joblib")
        if not target_path.exists():
            return {
                "stationId": str(st_id),
                "arrivalAt": str(arr_at),
                "availabilityLevel": None,
                "probability": None,
                "status": "FAILED",
                "errorMessage": f"Model artifact not found at path: {target_path}",
            }

        try:
            import joblib
            model = joblib.load(target_path)
            # Run prediction if model has predict_proba
            if hasattr(model, "predict_proba"):
                # Mock or extract features
                feats = input_data.get("features", [0.0])
                if isinstance(feats, dict):
                    feats = list(feats.values())
                proba = float(model.predict_proba([feats])[0][-1])
            elif hasattr(model, "predict"):
                feats = input_data.get("features", [0.0])
                if isinstance(feats, dict):
                    feats = list(feats.values())
                proba = float(model.predict([feats])[0])
            else:
                proba = 0.5
        except Exception as exc:
            return {
                "stationId": str(st_id),
                "arrivalAt": str(arr_at),
                "availabilityLevel": None,
                "probability": None,
                "status": "FAILED",
                "errorMessage": f"Failed to execute model prediction: {exc}",
            }
    else:
        # Use predictor override (e.g. mock function for test fixture)
        try:
            proba = float(predictor_override(input_data))
        except Exception as exc:
            return {
                "stationId": str(st_id),
                "arrivalAt": str(arr_at),
                "availabilityLevel": None,
                "probability": None,
                "status": "FAILED",
                "errorMessage": f"Predictor execution failed: {exc}",
            }

    # Clamp probability to [0.0, 1.0]
    proba = max(0.0, min(1.0, proba))
    level = map_probability_to_availability_level(proba)

    return {
        "stationId": str(st_id),
        "arrivalAt": str(arr_at),
        "availabilityLevel": level,
        "probability": round(proba, 4),
        "status": "SUCCESS",
    }

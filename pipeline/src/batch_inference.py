"""DATA-3.2 Batch inference pre-calculation pipeline module."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
from typing import Any, Callable, Dict, List, Optional, Set, Union

import numpy as np
import pandas as pd

from pipeline.src.quality.prediction_batch_quality import validate_prediction_batch

SUPPORTED_HORIZONS = (60, 120, 180, 240)
SUPPORTED_QUANTITIES = (1, 2, 3, 4, 5)
REQUIRED_INPUT_KEYS = {
    "stationId",
    "featureAsOf",
    "currentBikeCount",
    "modelVersion",
    "inputManifestHash",
}


def _parse_iso_dt(val: Any) -> datetime:
    """Parse ISO datetime string or object into timezone-aware datetime."""
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        iso_str = val.replace("Z", "+00:00")
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    raise ValueError(f"Invalid ISO datetime: {val}")


def _format_iso_dt(dt: datetime) -> str:
    """Format datetime object into ISO string with Z timezone suffix if UTC."""
    if dt.tzinfo == timezone.utc or dt.tzinfo is None:
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return dt.isoformat()


def run_batch_inference(
    inputs: Union[List[Dict[str, Any]], pd.DataFrame],
    predictor: Callable[[List[Dict[str, Any]]], List[float]],
    generated_at: Optional[Union[str, datetime]] = None,
) -> Dict[str, Any]:
    """Execute pre-calculated batch inference for all active stations across 20 combinations.

    Args:
        inputs: List of station input dicts or DataFrame containing required input keys.
        predictor: Callable returning probability float list for given feature rows.
        generated_at: ISO timestamp when batch run is generated.

    Returns:
        Dict with keys: publishable, rows, errors, batchId, rowCount, sha256Hash.
    """
    errors: List[str] = []
    rows: List[Dict[str, Any]] = []

    # Handle generated_at
    if generated_at is None:
        gen_dt = datetime.now(timezone.utc)
    else:
        try:
            gen_dt = _parse_iso_dt(generated_at)
        except Exception as exc:
            errors.append(f"invalid_generated_at: {exc}")
            gen_dt = datetime.now(timezone.utc)
    generated_at_str = _format_iso_dt(gen_dt)

    # Convert DataFrame to list of dicts if needed
    if isinstance(inputs, pd.DataFrame):
        input_list = inputs.to_dict(orient="records")
    elif isinstance(inputs, list):
        input_list = inputs
    else:
        return {
            "publishable": False,
            "rows": [],
            "errors": ["inputs_not_list_or_dataframe"],
            "batchId": "invalid_batch",
            "rowCount": 0,
            "sha256Hash": "",
        }

    if not input_list:
        return {
            "publishable": False,
            "rows": [],
            "errors": ["empty_inputs"],
            "batchId": "empty_batch",
            "rowCount": 0,
            "sha256Hash": "",
        }

    # Validate inputs
    expected_station_ids: Set[str] = set()
    manifest_hashes: Set[str] = set()
    feature_rows_for_predictor: List[Dict[str, Any]] = []
    output_skeletons: List[Dict[str, Any]] = []

    for idx, station_input in enumerate(input_list):
        if not isinstance(station_input, dict):
            errors.append(f"input_item_{idx}_not_dict")
            continue

        missing = REQUIRED_INPUT_KEYS - set(station_input.keys())
        if missing:
            errors.append(f"input_item_{idx}_missing_keys: {sorted(missing)}")
            continue

        st_id = str(station_input["stationId"])
        as_of_val = station_input["featureAsOf"]
        curr_bikes = station_input["currentBikeCount"]
        model_ver = str(station_input["modelVersion"])
        manifest_hash = str(station_input["inputManifestHash"])

        expected_station_ids.add(st_id)
        manifest_hashes.add(manifest_hash)

        try:
            dt_as_of = _parse_iso_dt(as_of_val)
        except Exception as exc:
            errors.append(f"input_item_{idx}_invalid_featureAsOf: {exc}")
            continue

        as_of_str = _format_iso_dt(dt_as_of)

        # Derive date/time features
        day_of_week = dt_as_of.weekday()  # 0=Monday..6=Sunday
        hour_of_day = dt_as_of.hour
        month = dt_as_of.month
        is_weekend = 1 if day_of_week >= 5 else 0

        # Generate 20 combinations (4 horizons x 5 quantities)
        for horizon in SUPPORTED_HORIZONS:
            target_dt = dt_as_of + timedelta(minutes=horizon)
            target_at_str = _format_iso_dt(target_dt)

            for req_qty in SUPPORTED_QUANTITIES:
                feature_row = {
                    "station_id": st_id,
                    "current_bike_count": curr_bikes,
                    "day_of_week": day_of_week,
                    "hour_of_day": hour_of_day,
                    "month": month,
                    "is_weekend": is_weekend,
                    "horizon_minutes": horizon,
                    "required_bike_count": req_qty,
                }
                feature_rows_for_predictor.append(feature_row)

                skeleton = {
                    "stationId": st_id,
                    "featureAsOf": as_of_str,
                    "predictionTargetAt": target_at_str,
                    "horizonMinutes": horizon,
                    "requiredBikeCount": req_qty,
                    "probability": None,
                    "modelVersion": model_ver,
                    "generatedAt": generated_at_str,
                    "dataStatus": "CURATED",
                }
                output_skeletons.append(skeleton)

    # Generate batchId based on manifest hashes and generated_at
    combined_hash_seed = f"{sorted(manifest_hashes)}_{generated_at_str}"
    batch_id = f"batch-{hashlib.sha256(combined_hash_seed.encode('utf-8')).hexdigest()[:16]}"

    # Invoke predictor
    predictor_failed = False
    probabilities: List[float] = []
    if feature_rows_for_predictor:
        try:
            preds = predictor(feature_rows_for_predictor)
            if not isinstance(preds, (list, tuple, pd.Series, np.ndarray)):
                errors.append(f"predictor_invalid_return_type: {type(preds)}")
                predictor_failed = True
            elif len(preds) != len(feature_rows_for_predictor):
                errors.append(
                    f"predictor_output_length_mismatch: expected {len(feature_rows_for_predictor)}, got {len(preds)}"
                )
                predictor_failed = True
            else:
                probabilities = [float(p) for p in preds]
        except Exception as exc:
            errors.append(f"predictor_exception: {type(exc).__name__} - {exc}")
            predictor_failed = True

    # Assemble output rows
    for i, skeleton in enumerate(output_skeletons):
        row = dict(skeleton)
        row["batchId"] = batch_id
        if not predictor_failed and i < len(probabilities):
            row["probability"] = probabilities[i]
        else:
            row["probability"] = -1.0
            row["dataStatus"] = "INVALID"
        rows.append(row)

    # Deterministic sorting
    rows.sort(
        key=lambda r: (
            r["stationId"],
            r["featureAsOf"],
            r["horizonMinutes"],
            r["requiredBikeCount"],
        )
    )

    # Validate output batch quality
    quality_errors = validate_prediction_batch(rows, expected_station_ids=expected_station_ids)
    errors.extend(quality_errors)

    # Determine publishable status
    publishable = (not predictor_failed) and (len(quality_errors) == 0) and (len(errors) == 0)

    if not publishable:
        for r in rows:
            r["dataStatus"] = "INVALID"

    # Compute deterministic SHA-256 hash of sorted rows
    json_bytes = json.dumps(rows, sort_keys=True, ensure_ascii=True).encode("utf-8")
    sha256_hash = hashlib.sha256(json_bytes).hexdigest()

    return {
        "publishable": publishable,
        "rows": rows,
        "errors": errors,
        "batchId": batch_id,
        "rowCount": len(rows),
        "sha256Hash": sha256_hash,
    }

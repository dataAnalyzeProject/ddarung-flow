"""Quality assertions for prediction batch inference results."""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple


def _parse_iso_datetime(dt_val: Any) -> datetime:
    """Parse ISO formatted datetime string or return datetime object directly."""
    if isinstance(dt_val, datetime):
        return dt_val
    if isinstance(dt_val, str):
        iso_str = dt_val.replace("Z", "+00:00")
        return datetime.fromisoformat(iso_str)
    raise ValueError(f"Invalid datetime format: {dt_val}")


def validate_prediction_batch(
    rows: List[Dict[str, Any]],
    expected_station_ids: Optional[Set[str]] = None,
) -> List[str]:
    """Validate 5 quality rules on batch prediction output rows.

    Checks:
    1. Range: 0.0 <= probability <= 1.0
    2. Monotonicity: P(>=1) >= P(>=2) >= ... >= P(>=5) per (station, featureAsOf, horizon)
    3. Duplication: Unique key (stationId, featureAsOf, predictionTargetAt, horizonMinutes, requiredBikeCount, modelVersion)
    4. Omission: Check expected_station_ids and 20 combinations per station
    5. Timestamp relationship: predictionTargetAt == featureAsOf + timedelta(minutes=horizonMinutes)

    Returns a list of error strings. Empty list indicates clean pass.
    """
    errors: List[str] = []

    if not isinstance(rows, list):
        return ["input_rows_not_list"]

    if not rows:
        return ["empty_prediction_batch"]

    seen_keys: Set[Tuple[str, str, str, int, int, str]] = set()
    station_combos: Dict[Tuple[str, str, int], Dict[int, float]] = {}
    found_stations: Set[str] = set()

    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"row_{idx}_not_dict")
            continue

        station_id = row.get("stationId")
        feature_as_of = row.get("featureAsOf")
        target_at = row.get("predictionTargetAt")
        horizon = row.get("horizonMinutes")
        required_qty = row.get("requiredBikeCount")
        prob = row.get("probability")
        model_ver = row.get("modelVersion")

        if station_id:
            found_stations.add(str(station_id))

        # 1. Range Check (0.0 <= probability <= 1.0)
        try:
            f_prob = float(prob)
            if not (0.0 <= f_prob <= 1.0):
                errors.append(f"range_violation: row_{idx}_station_{station_id}_prob_{prob}")
        except (TypeError, ValueError):
            errors.append(f"range_violation: row_{idx}_station_{station_id}_prob_{prob}")

        # 3. Duplication Check
        try:
            i_horizon = int(horizon)
        except (TypeError, ValueError):
            i_horizon = -1

        try:
            i_qty = int(required_qty)
        except (TypeError, ValueError):
            i_qty = -1

        key = (
            str(station_id),
            str(feature_as_of),
            str(target_at),
            i_horizon,
            i_qty,
            str(model_ver),
        )
        if key in seen_keys:
            errors.append(f"duplicate_key: station_{station_id}_horizon_{horizon}_qty_{required_qty}")
        else:
            seen_keys.add(key)

        # 5. Timestamp Relationship Check
        if feature_as_of and target_at and horizon is not None:
            try:
                dt_as_of = _parse_iso_datetime(feature_as_of)
                dt_target = _parse_iso_datetime(target_at)
                expected_target = dt_as_of + timedelta(minutes=i_horizon)
                if dt_target != expected_target:
                    errors.append(
                        f"timestamp_mismatch: station_{station_id}_as_of_{feature_as_of}_horizon_{horizon}_target_{target_at}"
                    )
            except Exception as exc:
                errors.append(f"timestamp_parse_error: row_{idx}_{exc}")

        # Group for monotonicity and combination completeness check
        if station_id and feature_as_of and horizon is not None and required_qty is not None and prob is not None:
            try:
                group_key = (str(station_id), str(feature_as_of), i_horizon)
                if group_key not in station_combos:
                    station_combos[group_key] = {}
                station_combos[group_key][i_qty] = float(prob)
            except (ValueError, TypeError):
                pass

    # 4. Omission Check: station IDs
    if expected_station_ids is not None:
        missing_stations = set(expected_station_ids) - found_stations
        if missing_stations:
            errors.append(f"missing_expected_stations: {sorted(missing_stations)}")

    # 4. Omission Check: 20 combinations per (station, featureAsOf)
    expected_horizons = {60, 120, 180, 240}
    expected_qtys = {1, 2, 3, 4, 5}

    station_as_of_horizons: Dict[Tuple[str, str], Set[int]] = {}
    for (st_id, as_of, hz), qtys_dict in station_combos.items():
        st_as_of_key = (st_id, as_of)
        if st_as_of_key not in station_as_of_horizons:
            station_as_of_horizons[st_as_of_key] = set()
        station_as_of_horizons[st_as_of_key].add(hz)

        # Check required quantities 1..5
        missing_qtys = expected_qtys - set(qtys_dict.keys())
        if missing_qtys:
            errors.append(f"missing_required_qtys: station_{st_id}_horizon_{hz}_missing_{sorted(missing_qtys)}")

        # 2. Monotonicity Check: P(>=1) >= P(>=2) >= P(>=3) >= P(>=4) >= P(>=5)
        sorted_qtys = sorted(qtys_dict.keys())
        for i in range(len(sorted_qtys) - 1):
            q_curr = sorted_qtys[i]
            q_next = sorted_qtys[i + 1]
            p_curr = qtys_dict[q_curr]
            p_next = qtys_dict[q_next]
            if p_next > p_curr + 1e-9:  # Floating point tolerance
                errors.append(
                    f"monotonicity_violation: station_{st_id}_horizon_{hz}_qty_{q_curr}({p_curr})_lt_qty_{q_next}({p_next})"
                )

    for (st_id, as_of), found_hzs in station_as_of_horizons.items():
        missing_hzs = expected_horizons - found_hzs
        if missing_hzs:
            errors.append(f"missing_horizons: station_{st_id}_as_of_{as_of}_missing_{sorted(missing_hzs)}")

    return errors

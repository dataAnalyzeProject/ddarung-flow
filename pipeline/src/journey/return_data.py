"""Capacity-as-of joins, return labels, and deterministic baseline skeletons.

All functions operate on small mapping records so they can be exercised with
fixtures before a curated capacity-history dataset has been approved.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from numbers import Integral


REASON_CODES = frozenset(
    {
        "CAPACITY_MISSING",
        "CAPACITY_CONFLICT",
        "INVALID_CAPACITY",
        "BIKE_COUNT_EXCEEDS_CAPACITY",
        "FUTURE_OBSERVATION_MISSING",
        "STATION_UNMATCHED",
    }
)
DEFAULT_REQUIRED_EMPTY_DOCK_COUNTS = (1, 2, 3, 4, 5)


def _instant(value, field_name):
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError(f"{field_name} must be an ISO-8601 timestamp")
    if parsed.tzinfo is None:
        raise ValueError(f"{field_name} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _instant_text(value, field_name):
    return _instant(value, field_name).isoformat().replace("+00:00", "Z")


def _positive_integer(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, Integral):
        return int(value) if value > 0 else None
    if isinstance(value, float) and value.is_integer() and value > 0:
        return int(value)
    if isinstance(value, str) and value.strip().isdigit() and int(value) > 0:
        return int(value)
    return None


def _nonnegative_integer(value, field_name):
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be a non-negative integer")
    if isinstance(value, Integral) and value >= 0:
        return int(value)
    if isinstance(value, float) and value.is_integer() and value >= 0:
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value)
    raise ValueError(f"{field_name} must be a non-negative integer")


def _capacity_record_sort_key(record):
    return (
        str(record.get("station_id", "")),
        str(record.get("valid_from", "")),
        str(record.get("valid_to", "")),
        str(record.get("source", "")),
        str(record.get("source_as_of", "")),
        str(record.get("capacity", "")),
    )


def build_capacity_history(station_master_snapshots):
    """Turn ordered station-master snapshots into half-open capacity intervals.

    Every input row needs ``station_id``, ``capacity``, ``as_of``, ``source`` and
    ``source_as_of``.  A station's next snapshot closes the preceding interval;
    its newest snapshot remains open ended (``valid_to=None``).
    """
    grouped = defaultdict(list)
    for row in station_master_snapshots:
        required = {"station_id", "capacity", "as_of", "source", "source_as_of"}
        missing = sorted(required - set(row))
        if missing:
            raise ValueError(f"station master snapshot missing fields: {missing}")
        grouped[str(row["station_id"])].append(dict(row))

    history = []
    for station_id in sorted(grouped):
        snapshots = sorted(
            grouped[station_id],
            key=lambda row: (
                _instant(row["as_of"], "as_of"),
                str(row["source"]),
                _instant_text(row["source_as_of"], "source_as_of"),
                str(row["capacity"]),
            ),
        )
        as_of_values = [_instant(row["as_of"], "as_of") for row in snapshots]
        if len(as_of_values) != len(set(as_of_values)):
            raise ValueError(
                f"station master snapshots conflict at the same as_of: {station_id}"
            )
        for index, snapshot in enumerate(snapshots):
            history.append(
                {
                    "station_id": station_id,
                    "capacity": snapshot["capacity"],
                    "valid_from": _instant_text(snapshot["as_of"], "as_of"),
                    "valid_to": (
                        _instant_text(snapshots[index + 1]["as_of"], "as_of")
                        if index + 1 < len(snapshots)
                        else None
                    ),
                    "source": snapshot["source"],
                    "source_as_of": _instant_text(
                        snapshot["source_as_of"], "source_as_of"
                    ),
                }
            )
    return history


def resolve_capacity_as_of(capacity_history, station_id, target_at):
    """Resolve exactly one capacity interval for ``station_id`` at ``target_at``.

    The returned mapping contains either ``capacity`` and provenance or a single
    ``reason_code``.  Intervals use ``valid_from <= target_at < valid_to``.
    """
    station_id = str(station_id)
    target = _instant(target_at, "target_at")
    station_rows = [
        dict(row)
        for row in capacity_history
        if str(row.get("station_id", "")) == station_id
    ]
    if not station_rows:
        return _capacity_failure(station_id, target, "STATION_UNMATCHED")

    matches = []
    for row in station_rows:
        try:
            valid_from = _instant(row["valid_from"], "valid_from")
            valid_to = (
                _instant(row["valid_to"], "valid_to")
                if row.get("valid_to") is not None
                else None
            )
        except (KeyError, ValueError):
            continue
        if valid_to is not None and valid_to <= valid_from:
            continue
        if valid_from <= target and (valid_to is None or target < valid_to):
            matches.append(row)
    if not matches:
        return _capacity_failure(station_id, target, "CAPACITY_MISSING")
    if any(_positive_integer(row.get("capacity")) is None for row in matches):
        return _capacity_failure(station_id, target, "INVALID_CAPACITY")
    if len(matches) != 1:
        return _capacity_failure(station_id, target, "CAPACITY_CONFLICT")

    match = matches[0]
    source = match.get("source")
    source_as_of = match.get("source_as_of")
    if not source or source_as_of is None:
        return _capacity_failure(station_id, target, "INVALID_CAPACITY")
    try:
        source_as_of = _instant_text(source_as_of, "source_as_of")
    except ValueError:
        return _capacity_failure(station_id, target, "INVALID_CAPACITY")
    return {
        "station_id": station_id,
        "target_at": target.isoformat().replace("+00:00", "Z"),
        "capacity": _positive_integer(match["capacity"]),
        "valid_from": _instant_text(match["valid_from"], "valid_from"),
        "valid_to": (
            _instant_text(match["valid_to"], "valid_to")
            if match.get("valid_to") is not None
            else None
        ),
        "source": source,
        "source_as_of": source_as_of,
        "reason_code": None,
    }


def _capacity_failure(station_id, target, reason_code):
    return {
        "station_id": station_id,
        "target_at": target.isoformat().replace("+00:00", "Z"),
        "capacity": None,
        "reason_code": reason_code,
    }


def build_return_labels(
    target_rows,
    future_observations,
    capacity_history,
    required_empty_dock_counts=DEFAULT_REQUIRED_EMPTY_DOCK_COUNTS,
):
    """Create binary labels or explicit quarantines for requested future targets.

    ``target_rows`` require ``station_id`` and ``target_at``.  Future observations
    require matching ``station_id``, ``observed_at`` and ``bike_count``.  The
    result is ``{"labels": [...], "quarantine": [...]}`` and is sorted so input
    ordering cannot affect it.  Capacity reasons take precedence when both
    capacity and future observation are unavailable for the same target.
    """
    required_counts = tuple(sorted(set(required_empty_dock_counts)))
    if required_counts != DEFAULT_REQUIRED_EMPTY_DOCK_COUNTS:
        raise ValueError("required_empty_dock_counts must contain every value from 1 to 5")

    future_by_key = defaultdict(list)
    for observation in future_observations:
        station_id = str(observation["station_id"])
        observed_at = _instant_text(observation["observed_at"], "observed_at")
        future_by_key[(station_id, observed_at)].append(dict(observation))

    labels = []
    quarantine = []
    normalized_targets = sorted(
        (
            {
                "station_id": str(row["station_id"]),
                "target_at": _instant_text(row["target_at"], "target_at"),
            }
            for row in target_rows
        ),
        key=lambda row: (row["station_id"], row["target_at"]),
    )
    for target in normalized_targets:
        capacity = resolve_capacity_as_of(
            capacity_history, target["station_id"], target["target_at"]
        )
        if capacity["reason_code"]:
            quarantine.append(
                {
                    "station_id": target["station_id"],
                    "target_at": target["target_at"],
                    "reason_code": capacity["reason_code"],
                }
            )
            continue
        observations = future_by_key.get(
            (target["station_id"], target["target_at"]), []
        )
        if not observations:
            quarantine.append({**target, "reason_code": "FUTURE_OBSERVATION_MISSING"})
            continue
        bike_counts = {
            _nonnegative_integer(row["bike_count"], "future bike_count")
            for row in observations
        }
        if len(bike_counts) != 1:
            raise ValueError("conflicting future bike_count observations must be quarantined upstream")
        future_bike_count = bike_counts.pop()
        if future_bike_count > capacity["capacity"]:
            quarantine.append(
                {**target, "reason_code": "BIKE_COUNT_EXCEEDS_CAPACITY"}
            )
            continue
        empty_dock_count = capacity["capacity"] - future_bike_count
        for required_count in required_counts:
            labels.append(
                {
                    "station_id": target["station_id"],
                    "target_at": target["target_at"],
                    "capacity_as_of": capacity["capacity"],
                    "capacity_source": capacity["source"],
                    "capacity_source_as_of": capacity["source_as_of"],
                    "future_bike_count": future_bike_count,
                    "actual_empty_dock_count": empty_dock_count,
                    "required_empty_dock_count": required_count,
                    "return_available": int(empty_dock_count >= required_count),
                }
            )
    return {
        "labels": sorted(
            labels,
            key=lambda row: (
                row["station_id"],
                row["target_at"],
                row["required_empty_dock_count"],
            ),
        ),
        "quarantine": sorted(
            quarantine,
            key=lambda row: (row["station_id"], row["target_at"], row["reason_code"]),
        ),
    }


def predict_persistence_baseline(examples):
    """Predict that a valid station's current number of empty docks persists."""
    predictions = []
    for row in examples:
        capacity = _positive_integer(row["capacity_as_of"])
        if capacity is None:
            raise ValueError("capacity_as_of must be a positive integer")
        current_bike_count = _nonnegative_integer(
            row["current_bike_count"], "current_bike_count"
        )
        if current_bike_count > capacity:
            raise ValueError("current_bike_count cannot exceed capacity_as_of")
        required = _positive_integer(row["required_empty_dock_count"])
        if required not in DEFAULT_REQUIRED_EMPTY_DOCK_COUNTS:
            raise ValueError("required_empty_dock_count must be from 1 to 5")
        predictions.append(
            {
                "station_id": str(row["station_id"]),
                "target_at": _instant_text(row["target_at"], "target_at"),
                "required_empty_dock_count": required,
                "predicted_probability": float(capacity - current_bike_count >= required),
            }
        )
    return sorted(
        predictions,
        key=lambda row: (
            row["station_id"], row["target_at"], row["required_empty_dock_count"]
        ),
    )


def _baseline_key(row, time_bucket_minutes):
    target = _instant(row["target_at"], "target_at")
    if 60 % time_bucket_minutes != 0:
        raise ValueError("time_bucket_minutes must divide one hour")
    minute_of_day = target.hour * 60 + target.minute
    bucket = minute_of_day // time_bucket_minutes
    required = _positive_integer(row["required_empty_dock_count"])
    if required not in DEFAULT_REQUIRED_EMPTY_DOCK_COUNTS:
        raise ValueError("required_empty_dock_count must be from 1 to 5")
    return (str(row["station_id"]), target.weekday(), bucket, required)


def fit_station_time_baseline(examples, time_bucket_minutes=60):
    """Fit station × weekday × time-bucket rates from ``split='train'`` only."""
    totals = defaultdict(int)
    counts = defaultdict(int)
    for row in examples:
        if row.get("split") != "train":
            continue
        key = _baseline_key(row, time_bucket_minutes)
        label = row["return_available"]
        if label not in (0, 1, False, True):
            raise ValueError("return_available must be binary")
        totals[key] += int(label)
        counts[key] += 1
    return {
        "time_bucket_minutes": time_bucket_minutes,
        "rates": {key: totals[key] / counts[key] for key in sorted(counts)},
    }


def predict_station_time_baseline(model, examples):
    """Return train-derived group rates; unseen groups remain ``None``."""
    bucket_minutes = model["time_bucket_minutes"]
    rates = model["rates"]
    predictions = []
    for row in examples:
        predictions.append(
            {
                "station_id": str(row["station_id"]),
                "target_at": _instant_text(row["target_at"], "target_at"),
                "required_empty_dock_count": _positive_integer(
                    row["required_empty_dock_count"]
                ),
                "predicted_probability": rates.get(_baseline_key(row, bucket_minutes)),
            }
        )
    return sorted(
        predictions,
        key=lambda row: (
            row["station_id"], row["target_at"], row["required_empty_dock_count"]
        ),
    )

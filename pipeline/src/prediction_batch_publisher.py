"""Publish validated DATA-3.2 batch rows to the Spring prediction tables."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Mapping, Sequence
from uuid import UUID, uuid5


PUBLISH_TTL = timedelta(hours=4)
_BATCH_NAMESPACE = UUID("2f40677c-2d77-4e46-979b-652d7546b71e")
_REQUIRED_QUANTITIES = (1, 2, 3, 4, 5)


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError("timestamp must be an ISO-8601 string or datetime")
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _required_value(rows: Sequence[Mapping[str, Any]], key: str) -> Any:
    values = {row.get(key) for row in rows}
    if len(values) != 1 or None in values:
        raise ValueError(f"batch rows must have one non-null {key}")
    return values.pop()


def _group_rows(rows: Iterable[Mapping[str, Any]]) -> list[tuple[str, datetime, int, tuple[float, ...]]]:
    grouped: dict[tuple[str, datetime, int], dict[int, float]] = defaultdict(dict)
    for row in rows:
        key = (
            str(row["stationId"]),
            _parse_timestamp(row["predictionTargetAt"]),
            int(row["horizonMinutes"]),
        )
        quantity = int(row["requiredBikeCount"])
        if quantity in grouped[key]:
            raise ValueError(f"duplicate prediction quantity for {key}")
        grouped[key][quantity] = float(row["probability"])

    published_rows = []
    for (station_id, target_at, horizon), probabilities in sorted(grouped.items()):
        if tuple(sorted(probabilities)) != _REQUIRED_QUANTITIES:
            raise ValueError(f"missing prediction quantity for {(station_id, target_at, horizon)}")
        published_rows.append(
            (station_id, target_at, horizon, tuple(probabilities[quantity] for quantity in _REQUIRED_QUANTITIES))
        )
    return published_rows


def publish_prediction_batch(connection: Any, batch_result: Mapping[str, Any]) -> dict[str, Any]:
    """Upsert one validated batch into ``prediction_batches`` and ``station_predictions``.

    ``connection`` is a PostgreSQL DB-API connection. Invalid or non-publishable
    results never open a transaction, preserving the last active batch.
    """
    if not batch_result.get("publishable"):
        raise ValueError("only publishable batch results can be published")
    rows = batch_result.get("rows")
    if not isinstance(rows, list) or not rows:
        raise ValueError("batch result must contain rows")

    batch_id_text = str(_required_value(rows, "batchId"))
    feature_as_of = _parse_timestamp(_required_value(rows, "featureAsOf"))
    generated_at = _parse_timestamp(_required_value(rows, "generatedAt"))
    model_version = str(_required_value(rows, "modelVersion"))
    batch_id = uuid5(_BATCH_NAMESPACE, batch_id_text)
    expires_at = feature_as_of + PUBLISH_TTL
    station_rows = _group_rows(rows)

    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO prediction_batches (
                batch_id, model_version, feature_as_of, generated_at, publish_status,
                published_at, expires_at, pipeline_run_id, created_at
            ) VALUES (%s, %s, %s, %s, 'ACTIVE', %s, %s, %s, %s)
            ON CONFLICT (batch_id) DO UPDATE SET
                model_version = EXCLUDED.model_version,
                feature_as_of = EXCLUDED.feature_as_of,
                generated_at = EXCLUDED.generated_at,
                publish_status = 'ACTIVE',
                published_at = EXCLUDED.published_at,
                expires_at = EXCLUDED.expires_at,
                pipeline_run_id = EXCLUDED.pipeline_run_id
            """,
            (batch_id, model_version, feature_as_of, generated_at, generated_at, expires_at, batch_id_text, generated_at),
        )
        for station_id, target_at, horizon, probabilities in station_rows:
            cursor.execute(
                """
                INSERT INTO station_predictions (
                    batch_id, station_id, prediction_target_at, horizon_minutes,
                    at_least_1_probability, at_least_2_probability, at_least_3_probability,
                    at_least_4_probability, at_least_5_probability, prediction_status, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'NORMAL', %s)
                ON CONFLICT (batch_id, station_id, prediction_target_at) DO UPDATE SET
                    horizon_minutes = EXCLUDED.horizon_minutes,
                    at_least_1_probability = EXCLUDED.at_least_1_probability,
                    at_least_2_probability = EXCLUDED.at_least_2_probability,
                    at_least_3_probability = EXCLUDED.at_least_3_probability,
                    at_least_4_probability = EXCLUDED.at_least_4_probability,
                    at_least_5_probability = EXCLUDED.at_least_5_probability,
                    prediction_status = 'NORMAL'
                """,
                (batch_id, station_id, target_at, horizon, *probabilities, generated_at),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()

    return {
        "batchId": str(batch_id),
        "pipelineRunId": batch_id_text,
        "expiresAt": expires_at.isoformat(),
        "publishedStationPredictions": len(station_rows),
    }

"""Score due prediction histories from one OCI curated snapshot per target hour."""

import io
import os
from datetime import datetime, timezone

import pandas as pd

from pipeline.src.storage.curated_snapshot_store import build_curated_snapshot_record
from pipeline.src.storage.oci_raw_store import create_object_storage_client


def curated_object_name(target_at):
    target = _as_datetime(target_at).replace(minute=0, second=0, microsecond=0)
    return build_curated_snapshot_record([], target)[0].as_posix()


def outcome_for(row, actual_bike_count):
    if row["prediction_status"] != "NORMAL" or actual_bike_count is None:
        return "UNVERIFIABLE"
    required = row["required_bike_count"]
    available = actual_bike_count >= required
    hit = not available if row["availability_level"] == "LOW" else available
    return "HIT" if hit else "MISS"


def score_prediction_histories(database_url, bucket_name, connection_factory, client_factory=create_object_storage_client, now=None):
    """Write only unscored, due rows. OCI access is injectable for fixture tests."""
    now = now or datetime.now(timezone.utc)
    with connection_factory(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, station_id, prediction_target_at, required_bike_count, availability_level, prediction_status FROM prediction_histories WHERE scored_at IS NULL")
            columns = [column.name for column in cursor.description]
            rows = [dict(zip(columns, record)) for record in cursor.fetchall()]
            if any(not str(row["station_id"] or "").startswith("ST-") for row in rows):
                raise ValueError("prediction history station_id must use ST- format")
            client = None
            snapshots = {}
            for row in rows:
                target = _as_datetime(row["prediction_target_at"])
                if target > now:
                    cursor.execute("UPDATE prediction_histories SET outcome = 'NOT_DUE' WHERE id = %s AND scored_at IS NULL", (row["id"],))
                    continue
                key = curated_object_name(target)
                if key not in snapshots:
                    client = client or client_factory()
                    snapshots[key] = _load_snapshot(client, bucket_name, key)
                frame = snapshots[key]
                actual = None if frame is None else _actual_bike_count(frame, row["station_id"])
                outcome = outcome_for(row, actual)
                cursor.execute("UPDATE prediction_histories SET actual_bike_count = %s, outcome = %s, scored_at = %s WHERE id = %s AND scored_at IS NULL", (actual, outcome, now, row["id"]))
        connection.commit()


def _load_snapshot(client, bucket_name, object_name):
    try:
        namespace = client.get_namespace().data
        response = client.get_object(namespace, bucket_name, object_name)
    except Exception as exc:
        if getattr(exc, "status", None) == 404:
            return None
        raise
    data = response.data.read() if hasattr(response.data, "read") else response.data.content
    return pd.read_parquet(io.BytesIO(data))


def _actual_bike_count(frame, station_id):
    matches = frame.loc[frame["station_id"] == station_id, "bike_count"]
    return None if matches.empty else int(matches.iloc[0])


def _as_datetime(value):
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


if __name__ == "__main__":
    import psycopg
    score_prediction_histories(os.environ["DATABASE_URL"], os.environ["OCI_BUCKET_NAME"], psycopg.connect)

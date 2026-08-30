"""Refresh station_inventory_current from a complete Seoul bike snapshot."""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone

import psycopg

from pipeline.src.collectors.bike_inventory_collector import (
    SeoulBikeApiClient,
    collect_bike_inventory,
)


DEFAULT_REFRESH_INTERVAL_SECONDS = 300
RETRY_DELAY_SECONDS = 60


def build_snapshot_rows(collection_result, minimum_rows=1000):
    node = collection_result.get("payload", {}).get("rentBikeStatus", {})
    source_rows = node.get("row")
    if not isinstance(source_rows, list) or len(source_rows) < minimum_rows:
        raise ValueError("bike inventory snapshot is incomplete")

    collected_at = collection_result.get("collected_at")
    if not collected_at:
        raise ValueError("collected_at is required")

    by_station = {}
    for source_row in source_rows:
        station_id = str(source_row.get("stationId") or "").strip()
        if not station_id:
            continue
        station_name = str(source_row.get("stationName") or "").strip()
        number_match = re.match(r"^(\d+)\s*\.", station_name)
        station_number = number_match.group(1) if number_match else None
        raw_count = source_row.get("parkingBikeTotCnt")
        if raw_count is None or str(raw_count).strip() == "":
            normalized = (station_id, station_number, None, collected_at, "MISSING")
        else:
            try:
                bike_count = int(str(raw_count).strip())
            except ValueError as exc:
                raise ValueError("parkingBikeTotCnt must be an integer") from exc
            if bike_count < 0:
                raise ValueError("parkingBikeTotCnt must not be negative")
            normalized = (station_id, station_number, bike_count, collected_at, "NORMAL")
        previous = by_station.get(station_id)
        if previous is not None and previous != normalized:
            raise ValueError("conflicting station inventory rows")
        by_station[station_id] = normalized

    if len(by_station) < minimum_rows:
        raise ValueError("bike inventory snapshot has too few unique stations")
    return [by_station[station_id] for station_id in sorted(by_station)]


def publish_snapshot(database_url, rows, connection_factory=psycopg.connect):
    if not rows:
        raise ValueError("snapshot rows must not be empty")
    collected_at = rows[0][3]
    with connection_factory(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TEMP TABLE inventory_snapshot (
                    station_id VARCHAR(50) PRIMARY KEY,
                    station_number VARCHAR(20),
                    available_bike_count INTEGER,
                    collected_at TIMESTAMPTZ NOT NULL,
                    inventory_status VARCHAR(20) NOT NULL
                ) ON COMMIT DROP
                """
            )
            cursor.executemany(
                """
                INSERT INTO inventory_snapshot
                    (station_id, station_number, available_bike_count, collected_at, inventory_status)
                VALUES (%s, %s, %s, %s, %s)
                """,
                rows,
            )
            cursor.execute(
                """
                UPDATE stations s
                SET station_number = i.station_number
                FROM inventory_snapshot i
                WHERE s.station_id = i.station_id
                  AND NULLIF(TRIM(s.station_number), '') IS NULL
                  AND i.station_number IS NOT NULL
                """
            )
            cursor.execute(
                """
                INSERT INTO station_inventory_current
                    (station_id, available_bike_count, collected_at, inventory_status, updated_at)
                SELECT s.station_id, i.available_bike_count, i.collected_at,
                       i.inventory_status, CURRENT_TIMESTAMP
                FROM inventory_snapshot i
                JOIN stations s ON s.station_id = i.station_id
                WHERE s.active = TRUE
                ON CONFLICT (station_id) DO UPDATE SET
                    available_bike_count = EXCLUDED.available_bike_count,
                    collected_at = EXCLUDED.collected_at,
                    inventory_status = EXCLUDED.inventory_status,
                    updated_at = CURRENT_TIMESTAMP
                """
            )
            cursor.execute(
                """
                INSERT INTO station_inventory_current
                    (station_id, available_bike_count, collected_at, inventory_status, updated_at)
                SELECT s.station_id, NULL, %s, 'MISSING', CURRENT_TIMESTAMP
                FROM stations s
                LEFT JOIN inventory_snapshot i ON i.station_id = s.station_id
                WHERE s.active = TRUE AND i.station_id IS NULL
                ON CONFLICT (station_id) DO UPDATE SET
                    available_bike_count = NULL,
                    collected_at = EXCLUDED.collected_at,
                    inventory_status = 'MISSING',
                    updated_at = CURRENT_TIMESTAMP
                """,
                (collected_at,),
            )


def refresh_once(api_key, database_url, now=None, minimum_rows=1000):
    collected_at = now or datetime.now(timezone.utc)
    client = SeoulBikeApiClient(api_key)
    result = collect_bike_inventory(client, collected_at)
    rows = build_snapshot_rows(result, minimum_rows=minimum_rows)
    publish_snapshot(database_url, rows)
    return len(rows)


def refresh_cycle(api_key, database_url, refresh=refresh_once, sleep=time.sleep):
    for attempt in range(2):
        try:
            count = refresh(api_key, database_url)
            print(f"inventory refresh succeeded: station_count={count}", flush=True)
            return True
        except Exception as exception:
            print(f"inventory refresh failed: {type(exception).__name__}", flush=True)
            if attempt == 0:
                sleep(RETRY_DELAY_SECONDS)
    return False


def next_cycle_delay(interval_seconds, elapsed_seconds):
    return max(0, interval_seconds - elapsed_seconds)


def main():
    api_key = os.getenv("SEOUL_OPEN_API_KEY", "")
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url and all(os.getenv(name) for name in ("DB_HOST", "DB_NAME", "DB_USERNAME", "DB_PASSWORD")):
        database_url = "host={host} dbname={name} user={user} password={password}".format(
            host=os.environ["DB_HOST"],
            name=os.environ["DB_NAME"],
            user=os.environ["DB_USERNAME"],
            password=os.environ["DB_PASSWORD"],
        )
    interval_seconds = int(os.getenv("INVENTORY_REFRESH_SECONDS", str(DEFAULT_REFRESH_INTERVAL_SECONDS)))
    if not api_key or not database_url:
        raise RuntimeError("SEOUL_OPEN_API_KEY and DATABASE_URL are required")
    if interval_seconds < 60:
        raise RuntimeError("INVENTORY_REFRESH_SECONDS must be at least 60")

    while True:
        cycle_started = time.monotonic()
        refresh_cycle(api_key, database_url)
        elapsed_seconds = time.monotonic() - cycle_started
        time.sleep(next_cycle_delay(interval_seconds, elapsed_seconds))


if __name__ == "__main__":
    main()

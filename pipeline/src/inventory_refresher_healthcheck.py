"""Verify that current inventory has a recent, complete published snapshot."""

from __future__ import annotations

import os
import sys

import psycopg


MINIMUM_SNAPSHOT_ROWS = 1000
FRESH_OK = "FRESH_OK"
STALE = "STALE"
MISSING = "MISSING"
PARTIAL = "PARTIAL"
FUTURE_TIMESTAMP = "FUTURE_TIMESTAMP"
DB_ERROR = "DB_ERROR"


def inventory_health_reason(database_url, connection_factory=psycopg.connect):
    try:
        with connection_factory(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    WITH latest_normal_snapshot AS (
                        SELECT MAX(i.collected_at) AS collected_at
                        FROM station_inventory_current i
                        JOIN stations s ON s.station_id = i.station_id
                        WHERE s.active = TRUE
                          AND i.inventory_status = 'NORMAL'
                    )
                    SELECT latest.collected_at >= CURRENT_TIMESTAMP - INTERVAL '10 minutes',
                           latest.collected_at <= CURRENT_TIMESTAMP,
                           COUNT(*)
                    FROM latest_normal_snapshot latest
                    JOIN station_inventory_current i ON i.collected_at = latest.collected_at
                    JOIN stations s ON s.station_id = i.station_id
                    WHERE s.active = TRUE
                      AND i.inventory_status = 'NORMAL'
                    GROUP BY latest.collected_at
                    """
                )
                row = cursor.fetchone()
    except Exception:
        return DB_ERROR

    if row is None:
        return MISSING
    if not row[1]:
        return FUTURE_TIMESTAMP
    if not row[0]:
        return STALE
    if row[2] < MINIMUM_SNAPSHOT_ROWS:
        return PARTIAL
    return FRESH_OK


def inventory_is_fresh(database_url, connection_factory=psycopg.connect):
    return inventory_health_reason(database_url, connection_factory) == FRESH_OK


def main():
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        print(DB_ERROR, flush=True)
        return 1
    reason = inventory_health_reason(database_url)
    print(reason, flush=True)
    return 0 if reason == FRESH_OK else 1


if __name__ == "__main__":
    sys.exit(main())

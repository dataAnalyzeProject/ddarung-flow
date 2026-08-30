"""Verify that current inventory has a recent, complete published snapshot."""

from __future__ import annotations

import os
import sys

import psycopg


MINIMUM_SNAPSHOT_ROWS = 1000


def inventory_is_fresh(database_url, connection_factory=psycopg.connect):
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
                    SELECT latest.collected_at >= CURRENT_TIMESTAMP - INTERVAL '10 minutes'
                               AND latest.collected_at <= CURRENT_TIMESTAMP,
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
        return False

    return bool(row and row[0] and row[1] >= MINIMUM_SNAPSHOT_ROWS)


def main():
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        return 1
    return 0 if inventory_is_fresh(database_url) else 1


if __name__ == "__main__":
    sys.exit(main())

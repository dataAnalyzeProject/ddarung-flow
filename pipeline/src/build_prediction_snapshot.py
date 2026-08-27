"""Build one inference input snapshot from the current inventory table."""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping


def _iso_timestamp(value: Any) -> str:
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    elif isinstance(value, datetime):
        parsed = value
    else:
        raise ValueError("collected_at must be a timestamp")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_snapshot_rows(inventory_rows: Iterable[Mapping[str, Any]], manifest: Mapping[str, Any]) -> list[dict[str, Any]]:
    model_version = manifest.get("model_version")
    artifact_hash = manifest.get("artifact_sha256")
    if not model_version or not artifact_hash:
        raise ValueError("manifest must contain model_version and artifact_sha256")

    normalized = []
    for row in inventory_rows:
        if row.get("inventory_status") != "NORMAL":
            continue
        station_number = row.get("station_number")
        bike_count = row.get("available_bike_count")
        if station_number is None or str(station_number).strip() == "":
            continue
        if bike_count is None:
            raise ValueError("NORMAL inventory rows require available_bike_count")
        try:
            station_number = int(str(station_number).strip())
        except ValueError as error:
            raise ValueError(f"station {row.get('station_id')} has invalid station_number {station_number!r}") from error
        normalized.append({
            "stationId": station_number,
            "featureAsOf": _iso_timestamp(row.get("collected_at")),
            "currentBikeCount": int(bike_count),
            "modelVersion": str(model_version),
            "inputManifestHash": str(artifact_hash),
        })

    if not normalized:
        raise ValueError("no NORMAL inventory rows are available")
    if len({row["featureAsOf"] for row in normalized}) != 1:
        raise ValueError("NORMAL inventory rows must share one collected_at")
    return sorted(normalized, key=lambda row: row["stationId"])


def load_current_inventory(database_url: str, connect: Callable[[str], Any]) -> list[dict[str, Any]]:
    connection = connect(database_url)
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                "SELECT i.station_id, s.station_number, i.collected_at, i.available_bike_count, i.inventory_status "
                "FROM station_inventory_current i JOIN stations s ON s.station_id = i.station_id "
                "ORDER BY i.collected_at DESC, i.station_id"
            )
            columns = [column.name for column in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            cursor.close()
    finally:
        connection.close()


def build_snapshot(database_url: str, manifest_path: Path, connect: Callable[[str], Any]) -> list[dict[str, Any]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return build_snapshot_rows(load_current_inventory(database_url, connect), manifest)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a prediction batch input snapshot from current inventory.")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        parser.error("DATABASE_URL must be set")
    try:
        import psycopg

        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        inventory_rows = load_current_inventory(database_url, psycopg.connect)
        snapshot = build_snapshot_rows(inventory_rows, manifest)
        skipped_count = sum(
            row.get("inventory_status") == "NORMAL"
            and (row.get("station_number") is None or str(row.get("station_number")).strip() == "")
            for row in inventory_rows
        )
        args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"prediction snapshot build failed: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"prediction snapshot build failed: {type(error).__name__}", file=sys.stderr)
        return 1
    print(json.dumps({"stationCount": len(snapshot), "skippedCount": skipped_count}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

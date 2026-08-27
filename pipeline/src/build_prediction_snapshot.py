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
        station_id = row.get("station_id")
        bike_count = row.get("available_bike_count")
        if station_id is None or bike_count is None:
            raise ValueError("NORMAL inventory rows require station_id and available_bike_count")
        normalized.append({
            "stationId": str(station_id),
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
                "SELECT station_id, collected_at, available_bike_count, inventory_status "
                "FROM station_inventory_current ORDER BY collected_at DESC, station_id"
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

        snapshot = build_snapshot(database_url, args.manifest, psycopg.connect)
        args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"prediction snapshot build failed: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"prediction snapshot build failed: {type(error).__name__}", file=sys.stderr)
        return 1
    print(json.dumps({"stationCount": len(snapshot)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

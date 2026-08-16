"""Manual entry point for publishing one validated prediction-batch JSON file."""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable, Mapping

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.src.prediction_batch_publisher import publish_prediction_batch


def load_batch_result(path: Path) -> Mapping[str, Any]:
    with path.open("r", encoding="utf-8") as batch_file:
        result = json.load(batch_file)
    if not isinstance(result, dict):
        raise ValueError("batch result JSON must be an object")
    return result


def publish_batch_file(
    batch_file: Path,
    database_url: str,
    connect: Callable[[str], Any],
) -> dict[str, Any]:
    connection = connect(database_url)
    try:
        return publish_prediction_batch(connection, load_batch_result(batch_file))
    finally:
        connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Publish one validated prediction batch to PostgreSQL.")
    parser.add_argument("--batch-result", required=True, type=Path, help="Path to a run_batch_inference JSON result.")
    args = parser.parse_args(argv)

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        parser.error("DATABASE_URL must be set")

    try:
        import psycopg

        result = publish_batch_file(args.batch_result, database_url, psycopg.connect)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"prediction batch publication failed: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"prediction batch publication failed: {type(error).__name__}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

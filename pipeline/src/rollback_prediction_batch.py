"""Deactivate one published prediction batch to expose the previous active batch."""

import argparse
import os
import sys
from uuid import UUID


def deactivate_prediction_batch(connection, batch_id):
    parsed = UUID(str(batch_id))
    cursor = connection.cursor()
    try:
        cursor.execute(
            "UPDATE prediction_batches SET publish_status = 'INACTIVE' "
            "WHERE batch_id = %s AND publish_status = 'ACTIVE'",
            (parsed,),
        )
        if cursor.rowcount != 1:
            raise ValueError("active prediction batch was not found")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
    return {"batchId": str(parsed), "publishStatus": "INACTIVE"}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Rollback one prediction batch without deleting data.")
    parser.add_argument("--batch-id", required=True)
    args = parser.parse_args(argv)
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        parser.error("DATABASE_URL must be set")
    try:
        import psycopg
        connection = psycopg.connect(database_url)
        try:
            result = deactivate_prediction_batch(connection, args.batch_id)
        finally:
            connection.close()
    except Exception as error:
        print(f"prediction batch rollback failed: {error}", file=sys.stderr)
        return 1
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from datetime import datetime, timezone
import unittest

from pipeline.src.inventory_current_refresher import build_snapshot_rows, publish_snapshot


def collection(rows):
    return {
        "collected_at": "2026-08-17T05:00:00+00:00",
        "payload": {"rentBikeStatus": {"row": rows}},
    }


class SnapshotTests(unittest.TestCase):
    def test_build_snapshot_rows_preserves_zero_and_missing(self):
        rows = build_snapshot_rows(collection([
            {"stationId": "ST-2", "stationName": "이름 형식 불명", "parkingBikeTotCnt": ""},
            {"stationId": "ST-1", "stationName": "102. 망원역", "parkingBikeTotCnt": "0"},
        ]), minimum_rows=2)
        self.assertEqual(rows, [
            ("ST-1", "102", 0, "2026-08-17T05:00:00+00:00", "NORMAL"),
            ("ST-2", None, None, "2026-08-17T05:00:00+00:00", "MISSING"),
        ])

    def test_incomplete_or_conflicting_snapshot_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "incomplete"):
            build_snapshot_rows(collection([]), minimum_rows=1)
        with self.assertRaisesRegex(ValueError, "conflicting"):
            build_snapshot_rows(collection([
                {"stationId": "ST-1", "parkingBikeTotCnt": "1"},
                {"stationId": "ST-1", "parkingBikeTotCnt": "2"},
            ]), minimum_rows=1)


class FakeCursor:
    def __init__(self):
        self.executed = []
        self.many = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def executemany(self, sql, rows):
        self.many.append((sql, list(rows)))


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def cursor(self):
        return self._cursor


class PublisherTests(unittest.TestCase):
    def test_publish_uses_one_transaction_and_marks_snapshot_omissions_missing(self):
        cursor = FakeCursor()
        rows = [("ST-1", "102", 0, datetime.now(timezone.utc), "NORMAL")]
        publish_snapshot("masked", rows, connection_factory=lambda _: FakeConnection(cursor))
        self.assertEqual(cursor.many[0][1], rows)
        self.assertIn("NULLIF(TRIM(s.station_number), '') IS NULL", cursor.executed[1][0])
        self.assertIn("ON CONFLICT (station_id) DO UPDATE", cursor.executed[2][0])
        self.assertIn("inventory_status = 'MISSING'", cursor.executed[3][0])

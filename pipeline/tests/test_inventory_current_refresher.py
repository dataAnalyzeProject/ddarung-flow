import contextlib
import io
from datetime import datetime, timezone
from pathlib import Path
import unittest
from unittest.mock import patch

from pipeline.src.inventory_current_refresher import (
    DEFAULT_REFRESH_INTERVAL_SECONDS,
    DEGRADED_RECOVERY_DELAYS_SECONDS,
    build_snapshot_rows,
    degraded_recovery_delay,
    next_cycle_delay,
    next_refresh_schedule,
    publish_snapshot,
    refresh_cycle,
)
from pipeline.src.collectors.bike_inventory_collector import SeoulBikeTransportError
from pipeline.src.inventory_refresher_healthcheck import (
    DB_ERROR,
    FRESH_OK,
    FUTURE_TIMESTAMP,
    MISSING,
    PARTIAL,
    STALE,
    inventory_health_reason,
    inventory_is_fresh,
    main as healthcheck_main,
)


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


class RefreshCycleTests(unittest.TestCase):
    def test_default_interval_is_five_minutes(self):
        self.assertEqual(DEFAULT_REFRESH_INTERVAL_SECONDS, 300)

    def test_successful_cycle_does_not_retry(self):
        calls = []

        def refresh(*_):
            calls.append(True)
            return 1000

        self.assertTrue(refresh_cycle("key", "database", refresh=refresh))
        self.assertEqual(len(calls), 1)

    def test_failed_cycle_does_not_repeat_the_whole_snapshot(self):
        calls = []

        def refresh(*_):
            calls.append(True)
            raise SeoulBikeTransportError("TIMEOUT", True)

        self.assertFalse(refresh_cycle("key", "database", refresh=refresh))
        self.assertEqual(len(calls), 1)

    def test_failure_logging_is_sanitized(self):
        output = io.StringIO()

        with contextlib.redirect_stdout(output):
            self.assertFalse(
                refresh_cycle(
                    "secret-key",
                    "sensitive database",
                    refresh=lambda *_: (_ for _ in ()).throw(SeoulBikeTransportError("TIMEOUT", True)),
                )
            )

        self.assertEqual(output.getvalue(), "event=inventory_refresh_failure category=TIMEOUT\n")
        self.assertNotIn("secret-key", output.getvalue())
        self.assertNotIn("database", output.getvalue())

    def test_normal_cycle_uses_start_to_start_five_minute_cadence(self):
        self.assertEqual(next_cycle_delay(300, 25), 275)
        self.assertEqual(next_cycle_delay(300, 360), 0)

    def test_degraded_recovery_cadence_is_bounded_and_slows_down(self):
        self.assertEqual(DEGRADED_RECOVERY_DELAYS_SECONDS, (60, 120, 240, 300))
        self.assertEqual(
            [degraded_recovery_delay(streak, random_source=lambda *_: 0) for streak in range(1, 6)],
            [60, 120, 240, 300, 300],
        )
        self.assertEqual(degraded_recovery_delay(1, random_source=lambda *_: 10), 70)

    def test_degraded_recovery_rejects_zero_failure_streak(self):
        with self.assertRaisesRegex(ValueError, "positive"):
            degraded_recovery_delay(0)

    def test_failure_schedule_slows_down_and_success_resets_the_streak(self):
        first_delay, first_streak = next_refresh_schedule(False, 300, 999, 0, random_source=lambda *_: 0)
        second_delay, second_streak = next_refresh_schedule(False, 300, 999, first_streak, random_source=lambda *_: 0)
        recovered_delay, recovered_streak = next_refresh_schedule(True, 300, 25, second_streak)

        self.assertEqual((first_delay, first_streak), (60, 1))
        self.assertEqual((second_delay, second_streak), (120, 2))
        self.assertEqual((recovered_delay, recovered_streak), (275, 0))


class HealthcheckCursor:
    def __init__(self, row=None, error=None):
        self.row = row
        self.error = error
        self.sql = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, sql):
        if self.error:
            raise self.error
        self.sql = sql

    def fetchone(self):
        return self.row


class HealthcheckTests(unittest.TestCase):
    def healthcheck(self, row=None, error=None):
        cursor = HealthcheckCursor(row=row, error=error)
        reason = inventory_health_reason("masked", connection_factory=lambda _: FakeConnection(cursor))
        return reason, cursor

    def test_fresh_complete_snapshot_passes(self):
        reason, cursor = self.healthcheck((True, True, 1000))
        self.assertEqual(reason, FRESH_OK)
        self.assertTrue(inventory_is_fresh("masked", connection_factory=lambda _: FakeConnection(HealthcheckCursor((True, True, 1000)))))
        self.assertIn("CURRENT_TIMESTAMP - INTERVAL '10 minutes'", cursor.sql)
        self.assertIn("i.inventory_status = 'NORMAL'", cursor.sql)

    def test_stale_snapshot_fails(self):
        reason, _ = self.healthcheck((False, True, 1000))
        self.assertEqual(reason, STALE)

    def test_future_snapshot_fails(self):
        reason, cursor = self.healthcheck((True, False, 1000))
        self.assertEqual(reason, FUTURE_TIMESTAMP)
        self.assertIn("latest.collected_at <= CURRENT_TIMESTAMP", cursor.sql)

    def test_missing_current_inventory_fails(self):
        reason, _ = self.healthcheck(None)
        self.assertEqual(reason, MISSING)

    def test_incomplete_recent_snapshot_fails(self):
        reason, _ = self.healthcheck((True, True, 999))
        self.assertEqual(reason, PARTIAL)

    def test_database_failure_fails_without_exposing_connection_details(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            reason, _ = self.healthcheck(error=RuntimeError("sensitive connection value"))
        self.assertEqual(reason, DB_ERROR)
        self.assertEqual(output.getvalue(), "")

    def test_main_outputs_only_the_sanitized_reason_code(self):
        output = io.StringIO()
        with patch.dict("os.environ", {"DATABASE_URL": "sensitive connection value"}, clear=True), \
             patch("pipeline.src.inventory_refresher_healthcheck.inventory_health_reason", return_value=STALE), \
             contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            self.assertEqual(healthcheck_main(), 1)
        self.assertEqual(output.getvalue(), f"{STALE}\n")

    def test_main_exits_zero_only_for_fresh_ok(self):
        output = io.StringIO()
        with patch.dict("os.environ", {"DATABASE_URL": "masked"}, clear=True), \
             patch("pipeline.src.inventory_refresher_healthcheck.inventory_health_reason", return_value=FRESH_OK), \
             contextlib.redirect_stdout(output):
            self.assertEqual(healthcheck_main(), 0)
        self.assertEqual(output.getvalue(), f"{FRESH_OK}\n")

    def test_staging_workflow_preserves_last_sanitized_health_reason(self):
        workflow = (
            Path(__file__).parents[2] / ".github" / "workflows" / "staging-deploy.yml"
        ).read_text(encoding="utf-8")

        self.assertIn('{{printf "%s" .Output}}', workflow)
        self.assertNotIn("{{println .Output}}", workflow)
        self.assertEqual(STALE, "MISSING\nSTALE\n".splitlines()[-1])

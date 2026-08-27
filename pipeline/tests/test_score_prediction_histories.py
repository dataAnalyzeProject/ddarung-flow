from datetime import datetime, timezone

from types import SimpleNamespace

from pipeline.src.scoring.score_prediction_histories import curated_object_name, outcome_for, score_prediction_histories


def row(level="HIGH", status="NORMAL", required=2):
    return {"availability_level": level, "prediction_status": status, "required_bike_count": required}


def test_outcomes_include_hit_miss_unverifiable_and_low_inversion():
    assert outcome_for(row(), 2) == "HIT"
    assert outcome_for(row(), 1) == "MISS"
    assert outcome_for(row("LOW"), 1) == "HIT"
    assert outcome_for(row(status="UNAVAILABLE"), 4) == "UNVERIFIABLE"
    assert outcome_for(row(), None) == "UNVERIFIABLE"


def test_curated_object_name_uses_target_date_partition():
    target = datetime(2026, 8, 27, 1, 37, tzinfo=timezone.utc)
    assert curated_object_name(target) == "curated/year=2026/month=08/day=27/observed_20260827T010000p0000.parquet"


class Cursor:
    description = [SimpleNamespace(name=name) for name in ("id", "station_id", "prediction_target_at", "required_bike_count", "availability_level", "prediction_status")]
    def __init__(self, rows): self.rows, self.calls = rows, []
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, params=()): self.calls.append((sql, params))
    def fetchall(self): return self.rows


class Connection:
    def __init__(self, rows): self.cursor_instance, self.committed = Cursor(rows), False
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self): return self.cursor_instance
    def commit(self): self.committed = True


class MissingObject(Exception): status = 404
class MissingClient:
    def get_namespace(self): return SimpleNamespace(data="fixture")
    def get_object(self, *_): raise MissingObject()


def test_missing_object_is_unverifiable_and_client_is_a_fixture_mock():
    connection = Connection([(1, "ST-493", "2026-08-27T01:00:00+00:00", 2, "HIGH", "NORMAL")])
    score_prediction_histories("fixture-db", "fixture-bucket", lambda _: connection, client_factory=MissingClient, now=datetime(2026, 8, 27, 2, tzinfo=timezone.utc))
    update = connection.cursor_instance.calls[-1]
    assert update[1][1:3] == ("UNVERIFIABLE", datetime(2026, 8, 27, 2, tzinfo=timezone.utc))
    assert connection.committed is True


def test_rerun_with_no_unscored_rows_does_not_update_or_contact_oci():
    connection = Connection([])
    score_prediction_histories("fixture-db", "fixture-bucket", lambda _: connection, client_factory=lambda: (_ for _ in ()).throw(AssertionError("OCI must not be contacted")))
    assert len(connection.cursor_instance.calls) == 1

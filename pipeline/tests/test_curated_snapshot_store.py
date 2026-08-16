"""정규화 스냅샷 Parquet writer의 라운드트립과 멱등성을 검증한다."""

from datetime import datetime, timezone

import pandas as pd
import pytest

from pipeline.src.storage.curated_snapshot_store import (
    CURATED_SNAPSHOT_COLUMNS,
    build_curated_snapshot_record,
    write_curated_snapshot_once_local,
)


SAMPLE_ROWS = [
    {
        "station_id": "ST-1001",
        "station_name": "테스트 대여소 1",
        "observed_at": "2026-08-16T02:00:00Z",
        "bike_count": 5,
        "rack_count": 10,
        "latitude": 37.5665,
        "longitude": 126.9780,
        "collected_at": "2026-08-16T02:00:03Z",
    },
    {
        "station_id": "ST-1002",
        "station_name": "테스트 대여소 2",
        "observed_at": "2026-08-16T02:00:00Z",
        "bike_count": 0,
        "rack_count": 15,
        "latitude": 37.5700,
        "longitude": 126.9800,
        "collected_at": "2026-08-16T02:00:03Z",
    },
]

OBSERVED_AT = datetime(2026, 8, 16, 2, 0, 0, tzinfo=timezone.utc)


def test_build_curated_snapshot_record_uses_raw_style_partitioning():
    relative_path, frame = build_curated_snapshot_record(SAMPLE_ROWS, OBSERVED_AT)

    parts = relative_path.parts
    assert parts[0] == "curated"
    assert parts[1] == "year=2026"
    assert parts[2] == "month=08"
    assert parts[3] == "day=16"
    assert parts[4].startswith("observed_") and parts[4].endswith(".parquet")
    assert list(frame.columns) == CURATED_SNAPSHOT_COLUMNS


def test_write_creates_a_readable_parquet_file(tmp_path):
    result = write_curated_snapshot_once_local(SAMPLE_ROWS, OBSERVED_AT, tmp_path)

    assert result["created"] is True
    assert result["row_count"] == 2
    read_back = pd.read_parquet(result["path"])
    assert len(read_back) == 2
    assert set(read_back["station_id"]) == {"ST-1001", "ST-1002"}
    assert read_back.loc[read_back["station_id"] == "ST-1002", "bike_count"].iloc[0] == 0


def test_rerun_with_same_observed_at_does_not_overwrite(tmp_path):
    first = write_curated_snapshot_once_local(SAMPLE_ROWS, OBSERVED_AT, tmp_path)
    assert first["created"] is True

    different_rows = [{**SAMPLE_ROWS[0], "bike_count": 999}]
    second = write_curated_snapshot_once_local(different_rows, OBSERVED_AT, tmp_path)

    assert second["created"] is False
    assert second["path"] == first["path"]
    # 재실행이 기존 파일을 덮어쓰지 않았는지 실제로 다시 읽어 확인한다.
    preserved = pd.read_parquet(first["path"])
    assert 999 not in preserved["bike_count"].values


def test_missing_timezone_is_rejected(tmp_path):
    naive = datetime(2026, 8, 16, 2, 0, 0)
    with pytest.raises(ValueError):
        write_curated_snapshot_once_local(SAMPLE_ROWS, naive, tmp_path)

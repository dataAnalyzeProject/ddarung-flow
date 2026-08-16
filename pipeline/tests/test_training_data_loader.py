"""훈련 로더가 형식을 몰라도 되도록 격리하는지, 기간 필터·병합이 맞는지 검증한다."""

from datetime import datetime, timezone

import pandas as pd
import pytest

from pipeline.src.storage.curated_snapshot_store import write_curated_snapshot_once_local
from pipeline.src.training_data_loader import load_normalized_snapshots


def _rows(bike_count, station_id="ST-1001"):
    return [
        {
            "station_id": station_id,
            "station_name": "테스트 대여소",
            "observed_at": "PLACEHOLDER",
            "bike_count": bike_count,
            "rack_count": 10,
            "latitude": 37.5665,
            "longitude": 126.9780,
            "collected_at": "PLACEHOLDER",
        }
    ]


def _write(tmp_path, observed_at, bike_count, station_id="ST-1001"):
    rows = _rows(bike_count, station_id)
    iso = observed_at.isoformat()
    for row in rows:
        row["observed_at"] = iso
        row["collected_at"] = iso
    write_curated_snapshot_once_local(rows, observed_at, tmp_path)


def test_empty_period_returns_empty_frame_not_exception(tmp_path):
    result = load_normalized_snapshots(tmp_path)
    assert result.empty


def test_loader_merges_multiple_snapshots_into_one_frame(tmp_path):
    _write(tmp_path, datetime(2026, 8, 16, 2, 0, tzinfo=timezone.utc), bike_count=5)
    _write(tmp_path, datetime(2026, 8, 16, 3, 0, tzinfo=timezone.utc), bike_count=7)
    _write(tmp_path, datetime(2026, 8, 17, 2, 0, tzinfo=timezone.utc), bike_count=9)

    result = load_normalized_snapshots(tmp_path)

    assert len(result) == 3
    assert sorted(result["bike_count"].tolist()) == [5, 7, 9]


def test_loader_filters_by_half_open_period(tmp_path):
    _write(tmp_path, datetime(2026, 8, 15, 23, 0, tzinfo=timezone.utc), bike_count=1)
    _write(tmp_path, datetime(2026, 8, 16, 0, 0, tzinfo=timezone.utc), bike_count=2)
    _write(tmp_path, datetime(2026, 8, 16, 23, 0, tzinfo=timezone.utc), bike_count=3)
    _write(tmp_path, datetime(2026, 8, 17, 0, 0, tzinfo=timezone.utc), bike_count=4)

    result = load_normalized_snapshots(
        tmp_path,
        start=datetime(2026, 8, 16, 0, 0, tzinfo=timezone.utc),
        end=datetime(2026, 8, 17, 0, 0, tzinfo=timezone.utc),
    )

    assert sorted(result["bike_count"].tolist()) == [2, 3]


def test_loader_output_is_sorted_by_station_then_time(tmp_path):
    _write(tmp_path, datetime(2026, 8, 16, 3, 0, tzinfo=timezone.utc), bike_count=1, station_id="ST-2002")
    _write(tmp_path, datetime(2026, 8, 16, 2, 0, tzinfo=timezone.utc), bike_count=2, station_id="ST-1001")
    _write(tmp_path, datetime(2026, 8, 16, 4, 0, tzinfo=timezone.utc), bike_count=3, station_id="ST-1001")

    result = load_normalized_snapshots(tmp_path)

    assert result["station_id"].tolist() == ["ST-1001", "ST-1001", "ST-2002"]


def test_naive_bound_is_rejected(tmp_path):
    with pytest.raises(ValueError):
        load_normalized_snapshots(tmp_path, start=datetime(2026, 8, 16, 0, 0))

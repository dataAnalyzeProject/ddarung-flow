"""0대·누락·음수·누출·Raw 재실행 규칙을 확인한다."""

import copy
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pipeline.src.quality.raw_quality import validate_raw_quality
from pipeline.src.storage.local_raw_store import write_raw_once


FIXTURE_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name):
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def test_zero_bike_is_valid():
    result = validate_raw_quality("bike_inventory", load_fixture("bike_inventory_success.json"))

    assert result["passed"] is True
    assert result["metrics"]["zero_bike_count"] == 1


def test_empty_inventory_is_rejected():
    result = validate_raw_quality("bike_inventory", load_fixture("bike_inventory_empty.json"))

    assert result["passed"] is False
    assert "empty_inventory" in result["reasons"]


def test_negative_inventory_is_rejected():
    payload = load_fixture("bike_inventory_success.json")
    payload["bikeList"]["row"][0]["parkingBikeTotCnt"] = "-1"

    result = validate_raw_quality("bike_inventory", payload)

    assert result["passed"] is False
    assert result["metrics"]["negative_bike_count"] == 1


def test_future_target_field_is_rejected():
    payload = load_fixture("bike_inventory_success.json")
    payload["bikeList"]["row"][0]["future_bike_count"] = 3

    result = validate_raw_quality("bike_inventory", payload)

    assert result["passed"] is False
    assert "future_leakage_field" in result["reasons"]


def test_weather_observation_and_location_are_required():
    payload = load_fixture("weather_success.json")
    success = validate_raw_quality("weather", payload)
    missing_source = copy.deepcopy(payload)
    del missing_source["weather_source"]

    assert success["passed"] is True
    assert success["metrics"]["weather_source"] == "observation"
    assert validate_raw_quality("weather", missing_source)["passed"] is False


def test_write_raw_once_does_not_create_duplicate(tmp_path):
    payload = load_fixture("bike_inventory_success.json")
    observed_at = datetime(2026, 8, 3, 9, 0, tzinfo=ZoneInfo("Asia/Seoul"))
    collected_at = datetime(2026, 8, 3, 9, 5, tzinfo=ZoneInfo("Asia/Seoul"))

    first = write_raw_once(
        "bike_inventory", observed_at, collected_at, payload, tmp_path
    )
    second = write_raw_once(
        "bike_inventory", observed_at, collected_at, payload, tmp_path
    )

    assert first["created"] is True
    assert second["created"] is False
    assert first["path"] == second["path"]
    assert len(list(tmp_path.rglob("*.json"))) == 1


def test_written_raw_keeps_zero_and_collection_metadata(tmp_path):
    payload = load_fixture("bike_inventory_success.json")
    observed_at = "2026-08-03T09:00:00+09:00"
    collected_at = "2026-08-03T09:05:00+09:00"

    result = write_raw_once(
        "bike_inventory", observed_at, collected_at, payload, tmp_path
    )
    stored = json.loads(Path(result["path"]).read_text(encoding="utf-8"))

    assert stored["observed_at"] == observed_at
    assert stored["collected_at"] == collected_at
    assert stored["payload"]["bikeList"]["row"][0]["parkingBikeTotCnt"] == "0"

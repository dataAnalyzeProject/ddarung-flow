"""외부 서버 없이 재고·날씨 수집 계약을 확인한다."""

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from pipeline.src.collectors.bike_inventory_collector import collect_bike_inventory
from pipeline.src.collectors.weather_collector import (
    KmaUltraShortObservationClient,
    collect_weather,
    latest_ultra_short_base_time,
    normalize_ultra_short_observation,
)


FIXTURE_DIR = Path(__file__).parent / "fixtures"
COLLECTED_AT = datetime(2026, 8, 3, 9, 5, tzinfo=ZoneInfo("Asia/Seoul"))


def load_fixture(name):
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


class FakeBikeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def fetch_page(self, start_index, end_index):
        self.calls.append((start_index, end_index))
        return self.responses.pop(0)


class FakeWeatherClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def fetch(self, **params):
        self.calls.append(params)
        return self.response


def test_collect_bike_inventory_preserves_raw_page():
    response = load_fixture("bike_inventory_success.json")
    client = FakeBikeClient([response])

    result = collect_bike_inventory(client, COLLECTED_AT, page_size=1000)

    assert result["source"] == "bike_inventory"
    assert result["collected_at"] == COLLECTED_AT.isoformat()
    assert result["payloads"] == [response]
    assert result["payload"]["rentBikeStatus"]["list_total_count"] == 2
    assert client.calls == [(1, 1000)]


def test_collect_bike_inventory_reads_real_response_and_all_pages():
    first_rows = [
        {"stationId": f"ST-{number}", "parkingBikeTotCnt": "1"}
        for number in range(1000)
    ]
    second_rows = [{"stationId": "ST-1000", "parkingBikeTotCnt": "0"}]
    responses = [
        {
            "rentBikeStatus": {
                "list_total_count": 1000,
                "RESULT": {"CODE": "INFO-000"},
                "row": first_rows,
            }
        },
        {
            "rentBikeStatus": {
                "list_total_count": 1,
                "RESULT": {"CODE": "INFO-000"},
                "row": second_rows,
            }
        },
    ]
    client = FakeBikeClient(responses)

    result = collect_bike_inventory(client, COLLECTED_AT)

    assert client.calls == [(1, 1000), (1001, 2000)]
    assert result["payload"]["rentBikeStatus"]["list_total_count"] == 1001
    assert len(result["payload"]["rentBikeStatus"]["row"]) == 1001


def test_collect_bike_inventory_keeps_empty_response_for_quality_check():
    response = load_fixture("bike_inventory_empty.json")

    result = collect_bike_inventory(FakeBikeClient([response]), COLLECTED_AT)

    assert result["payloads"] == [response]


def test_collect_bike_inventory_propagates_client_failure():
    class FailingClient:
        def fetch_page(self, start_index, end_index):
            raise TimeoutError("fixture timeout")

    with pytest.raises(TimeoutError, match="fixture timeout"):
        collect_bike_inventory(FailingClient(), COLLECTED_AT)


def test_collect_weather_passes_required_request_fields():
    response = load_fixture("weather_success.json")
    client = FakeWeatherClient(response)

    result = collect_weather(
        client,
        base_date="20260803",
        base_time="0900",
        nx=60,
        ny=127,
        collected_at=COLLECTED_AT,
    )

    assert result["source"] == "weather"
    assert result["payload"] == response
    assert client.calls == [
        {
            "base_date": "20260803",
            "base_time": "0900",
            "nx": 60,
            "ny": 127,
            "data_type": "JSON",
        }
    ]


def test_latest_ultra_short_base_time_uses_last_available_hour():
    before_release = datetime(2026, 8, 3, 9, 39, tzinfo=ZoneInfo("Asia/Seoul"))
    after_release = datetime(2026, 8, 3, 9, 40, tzinfo=ZoneInfo("Asia/Seoul"))

    assert latest_ultra_short_base_time(before_release).strftime("%Y%m%d%H%M") == "202608030800"
    assert latest_ultra_short_base_time(after_release).strftime("%Y%m%d%H%M") == "202608030900"


def test_normalize_ultra_short_observation_adds_identity():
    response = {"response": load_fixture("weather_success.json")["response"]}

    result = normalize_ultra_short_observation(response, 60, 127)

    assert result["weather_source"] == "observation"
    assert result["observed_at"] == "2026-08-03T09:00:00+09:00"
    assert result["location_key"] == "60,127"


def test_kma_client_does_not_expose_key_on_failure(monkeypatch):
    def fail_request(url, timeout):
        raise TimeoutError("timeout")

    monkeypatch.setattr("pipeline.src.collectors.weather_collector.urlopen", fail_request)
    client = KmaUltraShortObservationClient("secret-key")

    with pytest.raises(ConnectionError, match="KMA weather API request failed") as exc_info:
        client.fetch(
            base_date="20260803",
            base_time="0900",
            nx=60,
            ny=127,
            data_type="JSON",
        )

    assert "secret-key" not in str(exc_info.value)

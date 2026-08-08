"""fixture로 따릉이·날씨 Raw/Curated 흐름을 검증하는 개발용 DAG."""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from airflow.sdk import dag, get_current_context, task
from airflow.sdk.exceptions import AirflowFailException

from pipeline.src.inventory_cleaning import curate_live_inventory_rows
from pipeline.src.collectors.bike_inventory_collector import (
    SeoulBikeApiClient,
    collect_bike_inventory,
)
from pipeline.src.collectors.weather_collector import (
    KmaUltraShortObservationClient,
    collect_weather,
    latest_ultra_short_base_time,
    normalize_ultra_short_observation,
)
from pipeline.src.quality.raw_quality import validate_raw_quality
from pipeline.src.storage.local_raw_store import write_raw_once
from pipeline.src.storage.oci_raw_store import write_raw_object_once


SEOUL_TZ = ZoneInfo("Asia/Seoul")
# 컨테이너 내부 기본 경로이며 Compose 환경변수로만 재정의한다.
DEFAULT_FIXTURE_DIR = "/opt/airflow/pipeline/tests/fixtures"
DEFAULT_RAW_ROOT = "/opt/airflow/data/raw"


def _write_raw(source, observed_at, collected_at, payload):
    mode = os.getenv("RAW_STORAGE_MODE", "local").lower()
    if mode not in {"local", "oci", "both"}:
        raise AirflowFailException("RAW_STORAGE_MODE must be 'local', 'oci', or 'both'")
    result = {}
    if mode in {"local", "both"}:
        result["local"] = write_raw_once(
            source=source,
            observed_at=observed_at,
            collected_at=collected_at,
            payload=payload,
            root_dir=os.getenv("RAW_ROOT_DIR", DEFAULT_RAW_ROOT),
        )
    if mode in {"oci", "both"}:
        result["oci"] = write_raw_object_once(
            source=source,
            observed_at=observed_at,
            collected_at=collected_at,
            payload=payload,
            bucket_name=os.getenv("OCI_BUCKET_NAME", ""),
        )
    return result


def _load_fixture(name):
    # 실제 API 키가 없어도 성공·실패 흐름을 반복 검증할 수 있게 한다.
    fixture_dir = Path(os.getenv("PIPELINE_FIXTURE_DIR", DEFAULT_FIXTURE_DIR))
    return json.loads((fixture_dir / name).read_text(encoding="utf-8"))


def _logical_time():
    # 실행할 때마다 현재 시각을 쓰지 않고 Airflow 논리시각을 사용해 재현성을 유지한다.
    logical_date = get_current_context()["logical_date"]
    return logical_date.in_timezone("Asia/Seoul")


class _FixtureBikeClient:
    """실제 HTTP 호출 대신 지정한 따릉이 JSON을 반환하는 개발용 client."""
    def __init__(self, payload):
        self.payload = payload

    def fetch_page(self, start_index, end_index):
        return self.payload


class _FixtureWeatherClient:
    """실제 HTTP 호출 대신 지정한 날씨 JSON을 반환하는 개발용 client."""
    def __init__(self, payload):
        self.payload = payload

    def fetch(self, **params):
        return self.payload


@dag(
    dag_id="bike_weather_raw_curated",
    schedule=None,
    start_date=datetime(2026, 8, 3, tzinfo=SEOUL_TZ),
    catchup=False,
    max_active_runs=1,
    tags=["ddarung-flow", "development", "fixture"],
)
def bike_weather_raw_curated():
    # 두 수집 태스크는 서로 독립적이며, 실패하면 Airflow가 최대 2회 재시도한다.
    @task(
        task_id="collect_bike_inventory",
        retries=2,
        retry_delay=timedelta(seconds=60),
        execution_timeout=timedelta(minutes=5),
        show_return_value_in_logs=False,
    )
    def collect_bike_inventory_task():
        collected_at = _logical_time()
        source_mode = os.getenv("BIKE_INVENTORY_SOURCE", "fixture").lower()
        if source_mode == "api":
            client = SeoulBikeApiClient(os.getenv("SEOUL_OPEN_API_KEY", ""))
        elif source_mode == "fixture":
            payload = _load_fixture(
                os.getenv("BIKE_INVENTORY_FIXTURE", "bike_inventory_success.json")
            )
            client = _FixtureBikeClient(payload)
        else:
            raise AirflowFailException(
                "BIKE_INVENTORY_SOURCE must be 'fixture' or 'api'"
            )
        result = collect_bike_inventory(client, collected_at)
        # 실제 API 응답과 동일한 형태의 fixture를 훼손하지 않고 Raw로 저장한다.
        raw_result = _write_raw(
            source="bike_inventory",
            observed_at=collected_at,
            collected_at=collected_at,
            payload={"pages": result["payloads"]},
        )
        return {
            "payload": result["payload"],
            "observed_at": collected_at.isoformat(),
            "collected_at": result["collected_at"],
            "raw_result": raw_result,
        }

    @task(
        task_id="collect_weather",
        retries=2,
        retry_delay=timedelta(seconds=60),
        execution_timeout=timedelta(minutes=5),
    )
    def collect_weather_task():
        collected_at = _logical_time()
        source_mode = os.getenv("WEATHER_SOURCE", "fixture").lower()
        if source_mode == "api":
            client = KmaUltraShortObservationClient(os.getenv("KMA_SERVICE_KEY", ""))
            base = latest_ultra_short_base_time(collected_at)
        elif source_mode == "fixture":
            payload = _load_fixture(os.getenv("WEATHER_FIXTURE", "weather_success.json"))
            client = _FixtureWeatherClient(payload)
            base = collected_at
        else:
            raise AirflowFailException("WEATHER_SOURCE must be 'fixture' or 'api'")
        nx = int(os.getenv("KMA_NX", "60"))
        ny = int(os.getenv("KMA_NY", "127"))
        # nx·ny는 서울 격자 기본값을 쓰되 실행환경에서 변경할 수 있다.
        result = collect_weather(
            client,
            base_date=base.strftime("%Y%m%d"),
            base_time=base.strftime("%H%M"),
            nx=nx,
            ny=ny,
            collected_at=collected_at,
        )
        payload = result["payload"]
        if source_mode == "api":
            payload = normalize_ultra_short_observation(payload, nx, ny)
        observed_at = payload["observed_at"]
        raw_result = _write_raw(
            source="weather",
            observed_at=observed_at,
            collected_at=collected_at,
            payload=payload,
        )
        return {
            "payload": payload,
            "observed_at": observed_at,
            "collected_at": result["collected_at"],
            "raw_result": raw_result,
        }

    @task(
        task_id="validate_raw_quality",
        retries=0,
        execution_timeout=timedelta(minutes=10),
        show_return_value_in_logs=False,
    )
    def validate_raw_quality_task(bike_raw, weather_raw):
        bike_quality = validate_raw_quality("bike_inventory", bike_raw["payload"])
        weather_quality = validate_raw_quality("weather", weather_raw["payload"])
        quality_result = {
            "bike_inventory": bike_quality,
            "weather": weather_quality,
        }
        failed_sources = [
            source for source, result in quality_result.items() if not result["passed"]
        ]
        # 이 예외가 발생하면 의존하는 두 Curated 태스크는 실행되지 않는다.
        if failed_sources:
            raise AirflowFailException(
                "Raw quality failed; Curated tasks are blocked: "
                + ", ".join(failed_sources)
            )
        return {
            "quality_result": quality_result,
            "bike_raw": bike_raw,
            "weather_raw": weather_raw,
        }

    @task(
        task_id="build_curated_inventory",
        retries=0,
        execution_timeout=timedelta(minutes=10),
        show_return_value_in_logs=False,
    )
    def build_curated_inventory_task(quality_result):
        bike_raw = quality_result["bike_raw"]
        rows = bike_raw["payload"]["rentBikeStatus"]["row"]
        curated, quarantine = curate_live_inventory_rows(
            rows,
            observed_at=bike_raw["observed_at"],
            collected_at=bike_raw["collected_at"],
        )
        return {"curated": curated, "quarantine": quarantine}

    @task(
        task_id="build_curated_weather",
        retries=0,
        execution_timeout=timedelta(minutes=10),
    )
    def build_curated_weather_task(quality_result):
        # 기상청 category 코드를 모델 입력용 논리 열로 변환한다.
        weather_raw = quality_result["weather_raw"]
        payload = weather_raw["payload"]
        items = payload["response"]["body"]["items"]["item"]
        measurements = {item["category"]: item["obsrValue"] for item in items}
        return {
            "observed_at": payload["observed_at"],
            "location_key": payload["location_key"],
            "temperature": float(measurements["T1H"]),
            "precipitation": float(measurements["RN1"]),
            "weather_source": payload["weather_source"],
            "collected_at": weather_raw["collected_at"],
        }

    # 함수 인자로 이전 결과를 넘겨 Airflow가 선행관계를 자동으로 구성하게 한다.
    bike_raw = collect_bike_inventory_task()
    weather_raw = collect_weather_task()
    quality_result = validate_raw_quality_task(bike_raw, weather_raw)
    build_curated_inventory_task(quality_result)
    build_curated_weather_task(quality_result)


bike_weather_raw_curated()

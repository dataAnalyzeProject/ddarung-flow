"""10분 수집 운영을 준비하는 수동 실행 전용 DAG (AIRFLOW-OPS-3.1 stage-1).

기존 개발용 bike_weather_raw_curated DAG와 완전히 분리된 별도 DAG다.
이 DAG는 다음을 하지 않는다.

- 자동 스케줄 실행 (schedule=None을 유지한다)
- Raw payload 저장, OCI object 생성, PostgreSQL 적재, 모델 결과 게시
- 승인되지 않은 시간당 집계 규칙의 계산

자동 수집 활성화는 CHG-092의 자동 수집 명시 APPROVED와 시간당 집계 규칙
승인이 모두 기록된 뒤 stage-2에서 별도로 결정한다.
"""

import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from airflow.sdk import dag, get_current_context, task
from airflow.sdk.exceptions import AirflowFailException

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


SEOUL_TZ = ZoneInfo("Asia/Seoul")
# DATA-OPS-3.5 승인: 연결·HTTP 실패는 60초 뒤 1회만 재시도한다.
COLLECT_RETRIES = 1
COLLECT_RETRY_DELAY = timedelta(seconds=60)
# DEC-009: 따릉이 API는 요청당 1000건 외에 일일 호출 한도가 없다.
# 따라서 일일 요청 상한을 두지 않는다. 다만 쿼터 부재가 무제한 재시도를
# 허용하는 것은 아니므로, 실패는 아래 COLLECT_RETRIES 규칙으로만 재시도한다.
PAGE_SIZE_LIMIT = 1000
# 시간당 집계 기준시각·선택 규칙은 DEC-010에서 정각 스냅샷 채택으로 확정됐다.
# 다만 구현은 stage-2 범위이므로 이 DAG는 계산하지 않고 경계만 선언한다.
HOURLY_AGGREGATION_APPROVAL = "RULE_APPROVED_IMPLEMENTATION_DEFERRED"


def _logical_time():
    # 실행할 때마다 현재 시각을 쓰지 않고 Airflow 논리시각을 사용해 재현성을 유지한다.
    logical_date = get_current_context()["logical_date"]
    return logical_date.in_timezone("Asia/Seoul")


def _require_api_source(variable_name):
    """stage-1은 fixture 저장·게시를 하지 않으므로 소스 모드를 명시적으로 요구한다."""
    mode = os.getenv(variable_name, "api").lower()
    if mode != "api":
        raise AirflowFailException(
            f"{variable_name} must be 'api' for the ten-minute collection DAG"
        )
    return mode


@dag(
    dag_id="bike_weather_ten_minute_collection",
    schedule=None,
    start_date=datetime(2026, 8, 16, tzinfo=SEOUL_TZ),
    catchup=False,
    max_active_runs=1,
    tags=["ddarung-flow", "ten-minute", "manual-only", "stage-1"],
)
def bike_weather_ten_minute_collection():
    @task(
        task_id="collect_bike_inventory",
        retries=COLLECT_RETRIES,
        retry_delay=COLLECT_RETRY_DELAY,
        execution_timeout=timedelta(minutes=5),
        show_return_value_in_logs=False,
    )
    def collect_bike_inventory_task():
        collected_at = _logical_time()
        _require_api_source("BIKE_INVENTORY_SOURCE")
        client = SeoulBikeApiClient(os.getenv("SEOUL_OPEN_API_KEY", ""))
        result = collect_bike_inventory(client, collected_at)
        # Raw payload는 저장하지 않는다. 품질 판정에 필요한 통합 응답만 넘긴다.
        return {
            "payload": result["payload"],
            "observed_at": collected_at.isoformat(),
            "collected_at": result["collected_at"],
            "request_attempts": len(result["payloads"]),
        }

    @task(
        task_id="collect_weather",
        retries=COLLECT_RETRIES,
        retry_delay=COLLECT_RETRY_DELAY,
        execution_timeout=timedelta(minutes=5),
        show_return_value_in_logs=False,
    )
    def collect_weather_task():
        collected_at = _logical_time()
        _require_api_source("WEATHER_SOURCE")
        client = KmaUltraShortObservationClient(os.getenv("KMA_SERVICE_KEY", ""))
        base = latest_ultra_short_base_time(collected_at)
        nx = int(os.getenv("KMA_NX", "60"))
        ny = int(os.getenv("KMA_NY", "127"))
        result = collect_weather(
            client,
            base_date=base.strftime("%Y%m%d"),
            base_time=base.strftime("%H%M"),
            nx=nx,
            ny=ny,
            collected_at=collected_at,
        )
        payload = normalize_ultra_short_observation(result["payload"], nx, ny)
        return {
            "payload": payload,
            "observed_at": payload["observed_at"],
            "collected_at": result["collected_at"],
            "request_attempts": 1,
        }

    @task(
        task_id="validate_raw_quality",
        retries=0,
        execution_timeout=timedelta(minutes=10),
        show_return_value_in_logs=False,
    )
    def validate_raw_quality_task(bike_raw, weather_raw):
        quality_result = {
            "bike_inventory": validate_raw_quality(
                "bike_inventory", bike_raw["payload"]
            ),
            "weather": validate_raw_quality("weather", weather_raw["payload"]),
        }
        failed_sources = [
            source for source, result in quality_result.items() if not result["passed"]
        ]
        # 이 예외가 발생하면 downstream 집계 경계 태스크는 실행되지 않는다.
        if failed_sources:
            raise AirflowFailException(
                "Raw quality failed; downstream aggregation is blocked: "
                + ", ".join(failed_sources)
            )
        return {
            "quality_result": quality_result,
            "observed_at": bike_raw["observed_at"],
            "request_attempts": bike_raw["request_attempts"]
            + weather_raw["request_attempts"],
        }

    @task(
        task_id="declare_hourly_aggregation_boundary",
        retries=0,
        execution_timeout=timedelta(minutes=5),
        show_return_value_in_logs=False,
    )
    def declare_hourly_aggregation_boundary_task(quality_result):
        """집계 경계를 선언만 하고 계산하지 않는다.

        DEC-010은 기준시각을 Asia/Seoul 정각으로, 선택 규칙을 정각 cycle
        원본 관측 채택으로 확정했다. 그러나 구현은 stage-2 범위이며
        CHG-092의 나머지 게이트가 남아 있어 여기서 계산하지 않는다.
        """
        return {
            "observed_at": quality_result["observed_at"],
            "upstream_quality_passed": True,
            "hourly_aggregation": HOURLY_AGGREGATION_APPROVAL,
            "aggregation_performed": False,
            "approved_rule": (
                "Asia/Seoul on-the-hour snapshot; adopt the HH:00 cycle "
                "observation as-is; no averaging; no backfill on a missing cycle."
            ),
            "page_size_limit": PAGE_SIZE_LIMIT,
            "request_attempts_this_run": quality_result["request_attempts"],
            "deferred_reason": (
                "Aggregation implementation belongs to stage-2; CHG-092 still "
                "blocks activation until the remaining gates are resolved."
            ),
        }

    # 함수 인자로 이전 결과를 넘겨 Airflow가 선행관계를 자동으로 구성하게 한다.
    bike_raw = collect_bike_inventory_task()
    weather_raw = collect_weather_task()
    quality_result = validate_raw_quality_task(bike_raw, weather_raw)
    declare_hourly_aggregation_boundary_task(quality_result)


bike_weather_ten_minute_collection()

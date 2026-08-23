"""10분 자동 수집 DAG - DEC-016/DEC-017에 따라 상시 가동 중.

기존 개발용 bike_weather_raw_curated DAG와 완전히 분리된 별도 DAG다.
CHG-092가 2026-08-22 DEC-016으로 자동 수집 시작을 명시 승인했고, 그 범위
안에서 저장 배선을 순서대로 마쳤다(1단계 Raw 저장, 2단계 정제+NOT_REPORTED,
3단계 Curated 저장+시간당 대표값 태그 - 전부 OCI 실제 검증 완료). 이 PR의
DEC-017로 4단계(스케줄 실제 주기 전환)를 적용해 schedule을 영구히
"*/10 * * * *"로 바꾼다 - DEC-014 파일럿과 달리 시간 제한이 없다.

정각(HH:00) cycle의 정규화 스냅샷은 평균 없이 그대로 시간당 대표값으로
재사용한다(DEC-010/DEC-013) - 별도 집계 계산이나 별도 writer는 없다.

남은 것은 5단계(lifecycle 삭제, dry-run 우선)뿐이다. 실제 삭제 실행은
이 활성화와 별개로 조장의 추가 승인이 필요하다(정책 v1.2/CHG-092 5절).
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
from pipeline.src.inventory_cleaning import (
    count_not_reported_stations,
    curate_live_inventory_rows,
    load_station_master,
)
from pipeline.src.quality.raw_quality import validate_raw_quality
from pipeline.src.storage.curated_snapshot_store import (
    write_curated_snapshot_once_local,
    write_curated_snapshot_once_oci,
)
from pipeline.src.storage.local_raw_store import write_raw_once
from pipeline.src.storage.oci_raw_store import write_raw_object_once


SEOUL_TZ = ZoneInfo("Asia/Seoul")
# DATA-OPS-3.5 승인: 연결·HTTP 실패는 60초 뒤 1회만 재시도한다.
COLLECT_RETRIES = 1
COLLECT_RETRY_DELAY = timedelta(seconds=60)
# DEC-009: 따릉이 API는 요청당 1000건 외에 일일 호출 한도가 없다.
# 따라서 일일 요청 상한을 두지 않는다. 다만 쿼터 부재가 무제한 재시도를
# 허용하는 것은 아니므로, 실패는 아래 COLLECT_RETRIES 규칙으로만 재시도한다.
PAGE_SIZE_LIMIT = 1000
# 시간당 집계 기준시각·선택 규칙은 DEC-010에서 정각 스냅샷 채택으로 확정됐다.
# "계산"은 평균·중앙값을 구하는 게 아니라 정각 cycle의 정규화 스냅샷을
# 그대로 재사용하는 것뿐이므로(DEC-013), 별도 계산 로직이나 별도 저장은
# 없다 - is_hourly_representative 태그로 그 cycle이 정각이었음만 표시한다.
HOURLY_AGGREGATION_APPROVAL = "RULE_APPROVED_IMPLEMENTED_VIA_CURATED_REUSE"


def _logical_time():
    # 실행할 때마다 현재 시각을 쓰지 않고 Airflow 논리시각을 사용해 재현성을 유지한다.
    # Airflow 3.x는 schedule=None DAG을 수동 트리거하면 context에 logical_date
    # 키 자체가 없을 수 있다(dag_run.logical_date가 None인 경우). 이때는
    # run_after(트리거 접수 시각)로 대체해 같은 재현성 목적을 유지한다.
    # run_after는 Pendulum이 아닌 표준 datetime일 수 있어 astimezone을 쓴다.
    context = get_current_context()
    logical_date = context.get("logical_date")
    if logical_date is None:
        logical_date = context["dag_run"].run_after
    return logical_date.astimezone(SEOUL_TZ)


def _require_api_source(variable_name):
    """stage-1은 fixture 저장·게시를 하지 않으므로 소스 모드를 명시적으로 요구한다."""
    mode = os.getenv(variable_name, "api").lower()
    if mode != "api":
        raise AirflowFailException(
            f"{variable_name} must be 'api' for the ten-minute collection DAG"
        )
    return mode


# 기존 1시간짜리 개발용 bike_weather_raw_curated DAG는 "bike_inventory"·
# "weather"라는 source 이름으로 같은 버킷/경로에 Raw를 쓴다. 10분 데이터를
# 같은 이름으로 쓰면 두 파이프라인의 산출물이 한 폴더에 섞여 보관정책·용량
# 추적이 헷갈리므로, 이 DAG 전용 source 이름을 따로 둔다.
RAW_SOURCE_BIKE_INVENTORY = "bike_inventory_10min"
RAW_SOURCE_WEATHER = "weather_10min"


def _write_raw(source, observed_at, collected_at, payload):
    """DATA-OPS-3.6/DEC-012에서 검증된 것과 같은 Raw 저장 경로를 쓴다.

    RAW_STORAGE_MODE는 기존 bike_weather_raw_curated DAG와 같은 스위치이며,
    OCI 배포 환경(docker-compose.oci.yaml)에는 이미 'oci'로 설정돼 있다.
    """
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
            root_dir=os.getenv("RAW_ROOT_DIR", "/opt/airflow/data/raw"),
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


def _write_curated(curated_rows, observed_at):
    """DEC-013에서 검증된 것과 같은 Curated(Parquet) 저장 경로를 쓴다.

    같은 RAW_STORAGE_MODE 스위치를 재사용한다 - Raw와 Curated 둘 다 "이번
    stage-2 배선이 실제로 쓰는지"를 뜻하는 같은 on/off이기 때문이다.
    """
    mode = os.getenv("RAW_STORAGE_MODE", "local").lower()
    result = {}
    if mode in {"local", "both"}:
        result["local"] = write_curated_snapshot_once_local(
            curated_rows,
            observed_at=observed_at,
            root_dir=os.getenv("RAW_ROOT_DIR", "/opt/airflow/data/raw"),
        )
    if mode in {"oci", "both"}:
        result["oci"] = write_curated_snapshot_once_oci(
            curated_rows,
            observed_at=observed_at,
            bucket_name=os.getenv("OCI_BUCKET_NAME", ""),
        )
    return result


def _is_on_the_hour_seoul(observed_at_utc_iso):
    """DEC-010: Asia/Seoul 정각(HH:00:00) cycle만 시간당 대표값으로 채택한다."""
    parsed = datetime.fromisoformat(observed_at_utc_iso.replace("Z", "+00:00"))
    seoul_time = parsed.astimezone(SEOUL_TZ)
    return seoul_time.minute == 0 and seoul_time.second == 0


@dag(
    dag_id="bike_weather_ten_minute_collection",
    schedule="*/10 * * * *",  # DEC-017: 영구 상시 가동 (파일럿 아님, 종료 시각 없음)
    start_date=datetime(2026, 8, 16, tzinfo=SEOUL_TZ),
    catchup=False,
    max_active_runs=1,
    tags=["ddarung-flow", "ten-minute", "stage-2", "dec-017", "live"],
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
        raw_result = _write_raw(
            source=RAW_SOURCE_BIKE_INVENTORY,
            observed_at=collected_at,
            collected_at=collected_at,
            payload={"pages": result["payloads"]},
        )
        return {
            "payload": result["payload"],
            "observed_at": collected_at.isoformat(),
            "collected_at": result["collected_at"],
            "request_attempts": len(result["payloads"]),
            "raw_result": raw_result,
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
        raw_result = _write_raw(
            source=RAW_SOURCE_WEATHER,
            observed_at=payload["observed_at"],
            collected_at=collected_at,
            payload=payload,
        )
        return {
            "payload": payload,
            "observed_at": payload["observed_at"],
            "collected_at": result["collected_at"],
            "request_attempts": 1,
            "raw_result": raw_result,
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
        task_id="curate_inventory",
        retries=0,
        execution_timeout=timedelta(minutes=5),
        show_return_value_in_logs=False,
    )
    def curate_inventory_task(bike_raw, quality_result):
        """DEC-012 규칙으로 재고를 정제하고 NOT_REPORTED 대여소 개수만 센다.

        정제 직후 Curated(Parquet)로 저장한다(DEC-013). bike_count=0으로
        채우지 않고 품질 실패로도 취급하지 않는다 - downstream을 막지 않는다.
        """
        rows = bike_raw["payload"]["rentBikeStatus"]["row"]
        curated, quarantine = curate_live_inventory_rows(
            rows,
            observed_at=bike_raw["observed_at"],
            collected_at=bike_raw["collected_at"],
        )
        master_station_ids = load_station_master()
        not_reported_count = count_not_reported_stations(
            curated, quarantine, master_station_ids
        )
        # 파티션 경계(year/month/day)를 Raw 저장과 동일하게 Asia/Seoul 기준으로
        # 맞추기 위해, curate_live_inventory_rows가 UTC Z로 바꾼 값이 아니라
        # bike_raw의 원래(Seoul-오프셋) observed_at을 그대로 쓴다.
        curated_result = _write_curated(curated, bike_raw["observed_at"])
        return {
            "observed_at": quality_result["observed_at"],
            "curated_row_count": len(curated),
            "quarantine_row_count": len(quarantine),
            "not_reported_count": not_reported_count,
            "master_station_count": len(master_station_ids),
            "request_attempts": quality_result["request_attempts"],
            "curated_result": curated_result,
            "is_hourly_representative": _is_on_the_hour_seoul(bike_raw["observed_at"]),
        }

    @task(
        task_id="declare_hourly_aggregation_boundary",
        retries=0,
        execution_timeout=timedelta(minutes=5),
        show_return_value_in_logs=False,
    )
    def declare_hourly_aggregation_boundary_task(curate_result):
        """DEC-010 시간당 집계 규칙을 적용한다.

        기준시각은 Asia/Seoul 정각(HH:00:00)이고, 선택 규칙은 정각 cycle의
        정규화 스냅샷을 평균 없이 그대로 채택하는 것이다(DEC-013 - 별도
        writer 없이 curate_inventory_task가 이미 저장한 같은 Parquet을
        재사용한다). 이 태스크는 그 cycle이 정각이었는지만 확인해 선언한다.
        """
        return {
            "observed_at": curate_result["observed_at"],
            "upstream_quality_passed": True,
            "is_hourly_representative": curate_result["is_hourly_representative"],
            "hourly_aggregation": HOURLY_AGGREGATION_APPROVAL,
            "aggregation_performed": curate_result["is_hourly_representative"],
            "approved_rule": (
                "Asia/Seoul on-the-hour snapshot; adopt the HH:00 cycle "
                "observation as-is; no averaging; no backfill on a missing cycle."
            ),
            "page_size_limit": PAGE_SIZE_LIMIT,
            "request_attempts_this_run": curate_result["request_attempts"],
            "not_reported_count": curate_result["not_reported_count"],
            "curated_row_count": curate_result["curated_row_count"],
            "quarantine_row_count": curate_result["quarantine_row_count"],
        }

    # 함수 인자로 이전 결과를 넘겨 Airflow가 선행관계를 자동으로 구성하게 한다.
    bike_raw = collect_bike_inventory_task()
    weather_raw = collect_weather_task()
    quality_result = validate_raw_quality_task(bike_raw, weather_raw)
    curate_result = curate_inventory_task(bike_raw, quality_result)
    declare_hourly_aggregation_boundary_task(curate_result)


bike_weather_ten_minute_collection()

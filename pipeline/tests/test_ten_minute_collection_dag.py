"""Airflow를 Windows에 설치하지 않고 10분 수집 DAG의 구조와 안전 경계를 검사한다."""

import ast
from pathlib import Path

import pytest


DAG_PATH = (
    Path(__file__).parents[1] / "dags" / "bike_weather_ten_minute_collection_dag.py"
)
EXISTING_DAG_PATH = (
    Path(__file__).parents[1] / "dags" / "bike_weather_raw_curated_dag.py"
)

EXPECTED_DAG_ID = "bike_weather_ten_minute_collection"
COLLECT_TASK_IDS = ("collect_bike_inventory", "collect_weather")
QUALITY_TASK_ID = "validate_raw_quality"
CURATE_TASK_ID = "curate_inventory"
AGGREGATION_TASK_ID = "declare_hourly_aggregation_boundary"

# DEC-016(CHG-092 최종 승인) 이후 stage-2 저장 배선을 순서대로 진행 중이다.
# 1단계(Raw 저장)·2단계(정제+NOT_REPORTED)·3단계(Curated 저장+시간당 태그)는
# 허용됐다. 훈련 로더·DB 적재·모델 게시는 아직 다음 단계이므로 계속 금지.
FORBIDDEN_IMPORT_FRAGMENTS = (
    "training_data_loader",
    "psycopg",
    "sqlalchemy",
    "batch_inference",
    "modeling",
    "model_registry",
)
FORBIDDEN_CALL_NAMES = (
    "upload_model_artifact",
    "publish",
)


@pytest.fixture(scope="module")
def source():
    return DAG_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def tree(source):
    return ast.parse(source)


def _decorator_kwargs(node, decorator_name):
    """지정한 데코레이터의 키워드 인자를 이름→AST 노드로 반환한다."""
    for decorator in node.decorator_list:
        if not isinstance(decorator, ast.Call):
            continue
        func = decorator.func
        name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", None)
        if name == decorator_name:
            return {kw.arg: kw.value for kw in decorator.keywords}
    return None


def _dag_function(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and _decorator_kwargs(node, "dag"):
            return node
    raise AssertionError("@dag 로 선언된 함수를 찾지 못했다")


def _task_functions(dag_function):
    return [
        node
        for node in dag_function.body
        if isinstance(node, ast.FunctionDef) and _decorator_kwargs(node, "task")
    ]


def _task_id(function):
    kwargs = _decorator_kwargs(function, "task")
    return ast.literal_eval(kwargs["task_id"])


def test_dag_file_is_valid_python(source):
    ast.parse(source)


def test_dag_id_is_separate_from_the_development_dag(tree):
    kwargs = _decorator_kwargs(_dag_function(tree), "dag")

    assert ast.literal_eval(kwargs["dag_id"]) == EXPECTED_DAG_ID

    existing = EXISTING_DAG_PATH.read_text(encoding="utf-8")
    assert f'dag_id="{EXPECTED_DAG_ID}"' not in existing


def test_schedule_matches_the_dec_017_approved_production_value(tree):
    """DEC-017: 파일럿이 아니라 영구 상시 가동. 다른 cron 값으로 몰래
    바뀌면 이 테스트가 실패해야 한다."""
    kwargs = _decorator_kwargs(_dag_function(tree), "dag")

    assert ast.literal_eval(kwargs["schedule"]) == "*/10 * * * *"
    assert ast.literal_eval(kwargs["catchup"]) is False
    assert ast.literal_eval(kwargs["max_active_runs"]) == 1


def test_task_ids_match_the_approved_boundary(tree):
    task_ids = [_task_id(function) for function in _task_functions(_dag_function(tree))]

    assert set(task_ids) == {
        *COLLECT_TASK_IDS,
        QUALITY_TASK_ID,
        CURATE_TASK_ID,
        AGGREGATION_TASK_ID,
    }


def test_dependency_order_is_collect_then_quality_then_aggregation(tree):
    dag_function = _dag_function(tree)
    bindings = {}
    calls = {}

    for node in dag_function.body:
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
            continue
        target = node.targets[0]
        if isinstance(target, ast.Name) and isinstance(node.value.func, ast.Name):
            bindings[target.id] = node.value.func.id

    for node in ast.walk(dag_function):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            calls[node.func.id] = [
                argument.id
                for argument in node.args
                if isinstance(argument, ast.Name)
            ]

    # 품질 태스크는 두 수집 결과를 모두 인자로 받아야 downstream이 된다.
    quality_inputs = calls["validate_raw_quality_task"]
    assert len(quality_inputs) == 2
    assert {bindings[name] for name in quality_inputs} == {
        "collect_bike_inventory_task",
        "collect_weather_task",
    }

    # 정제 태스크는 bike 수집 결과와 품질 태스크 결과를 인자로 받아야 한다.
    curate_inputs = calls["curate_inventory_task"]
    assert len(curate_inputs) == 2
    assert {bindings[name] for name in curate_inputs} == {
        "collect_bike_inventory_task",
        "validate_raw_quality_task",
    }

    # 집계 경계 태스크는 정제 태스크 결과만 인자로 받아야 한다.
    aggregation_inputs = calls["declare_hourly_aggregation_boundary_task"]
    assert len(aggregation_inputs) == 1
    assert bindings[aggregation_inputs[0]] == "curate_inventory_task"


def test_collection_failure_uses_the_approved_single_retry(tree):
    for function in _task_functions(_dag_function(tree)):
        if _task_id(function) not in COLLECT_TASK_IDS:
            continue
        kwargs = _decorator_kwargs(function, "task")
        # DATA-OPS-3.5 승인: 연결·HTTP 실패는 60초 뒤 1회만 재시도한다.
        assert ast.unparse(kwargs["retries"]) == "COLLECT_RETRIES"
        assert ast.unparse(kwargs["retry_delay"]) == "COLLECT_RETRY_DELAY"

    namespace = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            namespace[node.targets[0].id] = ast.unparse(node.value)

    assert namespace["COLLECT_RETRIES"] == "1"
    assert namespace["COLLECT_RETRY_DELAY"] == "timedelta(seconds=60)"


def test_quality_failure_blocks_downstream_tasks(tree):
    quality_function = next(
        function
        for function in _task_functions(_dag_function(tree))
        if _task_id(function) == QUALITY_TASK_ID
    )
    raises = [node for node in ast.walk(quality_function) if isinstance(node, ast.Raise)]

    assert raises, "품질 실패 시 downstream을 막는 예외가 없다"
    assert any("AirflowFailException" in ast.unparse(node) for node in raises)
    # 품질 태스크가 재시도로 실패를 삼키면 안 된다.
    assert ast.literal_eval(_decorator_kwargs(quality_function, "task")["retries"]) == 0


def test_hourly_aggregation_reuses_curated_snapshot_without_averaging(tree, source):
    """DEC-010/DEC-013: 정각 cycle의 curated 스냅샷을 그대로 재사용하고,
    평균·중앙값 등 별도 계산이나 별도 저장은 하지 않는다."""
    aggregation_function = next(
        function
        for function in _task_functions(_dag_function(tree))
        if _task_id(function) == AGGREGATION_TASK_ID
    )
    body = ast.unparse(aggregation_function)

    assert "HOURLY_AGGREGATION_APPROVAL" in body
    assert "'aggregation_performed': curate_result['is_hourly_representative']" in body
    assert (
        'HOURLY_AGGREGATION_APPROVAL = "RULE_APPROVED_IMPLEMENTED_VIA_CURATED_REUSE"'
        in source
    )
    # 승인된 규칙을 문서화하되 평균·중앙값 계산이나 별도 writer는 없어야 한다.
    assert "on-the-hour snapshot" in body
    assert "no backfill" in body
    assert "mean(" not in source and "median(" not in source
    assert "write_curated_snapshot_once" not in body, (
        "집계 경계 태스크가 별도로 저장하면 안 된다 - curate_inventory_task가 이미 저장했다"
    )


def test_no_daily_request_cap_is_asserted(source):
    """DEC-009: 따릉이 API에 일일 호출 한도가 없으므로 자체 상한을 두지 않는다."""
    assert "DAILY_REQUEST_ATTEMPT_CAP" not in source
    assert "864" not in source
    assert "PAGE_SIZE_LIMIT = 1000" in source


def test_training_database_and_model_publishing_are_not_imported(tree, source):
    """DEC-016 stage-2 1~3단계(Raw·정제·Curated 저장)만 배선됐다. 훈련 로더·
    DB·모델 게시는 아직 이 DAG에 들어오면 안 된다."""
    imported = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imported.append(node.module or "")
            imported.extend(alias.name for alias in node.names)

    lowered = [name.lower() for name in imported]
    for fragment in FORBIDDEN_IMPORT_FRAGMENTS:
        assert not any(fragment in name for name in lowered), (
            f"금지된 import 발견: {fragment}"
        )

    for call_name in FORBIDDEN_CALL_NAMES:
        assert call_name not in source, f"금지된 호출 발견: {call_name}"


def test_raw_storage_is_wired_for_both_collectors(tree, source):
    """1단계: Raw 저장이 실제로 두 수집 태스크 모두에 배선돼 있어야 한다."""
    assert "from pipeline.src.storage.local_raw_store import write_raw_once" in source
    assert (
        "from pipeline.src.storage.oci_raw_store import write_raw_object_once"
        in source
    )
    assert "RAW_STORAGE_MODE" in source

    for function in _task_functions(_dag_function(tree)):
        if _task_id(function) not in COLLECT_TASK_IDS:
            continue
        body = ast.unparse(function)
        assert "_write_raw(" in body, (
            f"{_task_id(function)}가 Raw를 저장하지 않는다"
        )
        assert "'raw_result':" in body

    # 10분 파이프라인은 기존 1시간짜리 개발용 DAG와 다른 source 이름을 써서
    # 같은 버킷 안에서 두 파이프라인의 Raw 산출물이 섞이지 않게 한다.
    existing = EXISTING_DAG_PATH.read_text(encoding="utf-8")
    assert 'source="bike_inventory"' in existing
    assert 'source="weather"' in existing
    assert "RAW_SOURCE_BIKE_INVENTORY = \"bike_inventory_10min\"" in source
    assert "RAW_SOURCE_WEATHER = \"weather_10min\"" in source


def test_curation_and_not_reported_counting_is_wired(tree, source):
    """2단계: 정제와 NOT_REPORTED 카운트가 실제로 배선돼 있어야 한다."""
    assert (
        "from pipeline.src.inventory_cleaning import" in source
        and "curate_live_inventory_rows" in source
        and "count_not_reported_stations" in source
        and "load_station_master" in source
    )

    curate_function = next(
        function
        for function in _task_functions(_dag_function(tree))
        if _task_id(function) == CURATE_TASK_ID
    )
    body = ast.unparse(curate_function)
    assert "curate_live_inventory_rows(" in body
    assert "load_station_master(" in body
    assert "count_not_reported_stations(" in body
    # 결과에 개수만 담고, 미보고 대여소를 위한 행을 새로 만들지 않는다.
    assert "'not_reported_count':" in body

    aggregation_function = next(
        function
        for function in _task_functions(_dag_function(tree))
        if _task_id(function) == AGGREGATION_TASK_ID
    )
    assert "not_reported_count" in ast.unparse(aggregation_function)


def test_curated_storage_is_wired_with_hourly_tagging(tree, source):
    """3단계: 정제 직후 Curated(Parquet) 저장이 실제로 배선돼 있어야 하고,
    정각 cycle인지 태그가 붙어야 한다."""
    assert (
        "from pipeline.src.storage.curated_snapshot_store import" in source
        and "write_curated_snapshot_once_local" in source
        and "write_curated_snapshot_once_oci" in source
    )

    curate_function = next(
        function
        for function in _task_functions(_dag_function(tree))
        if _task_id(function) == CURATE_TASK_ID
    )
    body = ast.unparse(curate_function)
    assert "_write_curated(" in body, "정제 태스크가 Curated를 저장하지 않는다"
    assert "'curated_result':" in body
    assert "_is_on_the_hour_seoul(" in body
    assert "'is_hourly_representative':" in body

    # Raw와 같은 RAW_STORAGE_MODE 스위치를 재사용해야 한다(새 env var 없음).
    assert source.count("RAW_STORAGE_MODE") >= 2

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
AGGREGATION_TASK_ID = "declare_hourly_aggregation_boundary"

# 새 DAG가 직접 접근하면 안 되는 저장·게시 경계.
FORBIDDEN_IMPORT_FRAGMENTS = (
    "storage",
    "oci",
    "psycopg",
    "sqlalchemy",
    "batch_inference",
    "modeling",
    "model_registry",
)
FORBIDDEN_CALL_NAMES = (
    "write_raw_once",
    "write_raw_object_once",
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


def test_automatic_scheduling_is_disabled(tree):
    kwargs = _decorator_kwargs(_dag_function(tree), "dag")

    assert ast.literal_eval(kwargs["schedule"]) is None
    assert ast.literal_eval(kwargs["catchup"]) is False
    assert ast.literal_eval(kwargs["max_active_runs"]) == 1


def test_task_ids_match_the_approved_boundary(tree):
    task_ids = [_task_id(function) for function in _task_functions(_dag_function(tree))]

    assert set(task_ids) == {
        *COLLECT_TASK_IDS,
        QUALITY_TASK_ID,
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

    # 집계 경계 태스크는 품질 태스크 결과만 인자로 받아야 한다.
    aggregation_inputs = calls["declare_hourly_aggregation_boundary_task"]
    assert len(aggregation_inputs) == 1
    assert bindings[aggregation_inputs[0]] == "validate_raw_quality_task"


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


def test_unapproved_hourly_aggregation_is_declared_but_not_computed(tree, source):
    aggregation_function = next(
        function
        for function in _task_functions(_dag_function(tree))
        if _task_id(function) == AGGREGATION_TASK_ID
    )
    body = ast.unparse(aggregation_function)

    assert "HOURLY_AGGREGATION_APPROVAL" in body
    assert "'aggregation_performed': False" in body
    assert 'HOURLY_AGGREGATION_APPROVAL = "NOT_APPROVED"' in source


def test_no_raw_storage_oci_database_or_model_publishing_is_imported(tree, source):
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

    # 저장 모드 분기가 남아 있으면 실제 Raw 저장 경로가 열린다.
    assert "RAW_STORAGE_MODE" not in source

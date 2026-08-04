"""Airflow를 Windows에 설치하지 않고 DAG 구조와 정책을 검사한다."""

import ast
from pathlib import Path


DAG_PATH = Path(__file__).parents[1] / "dags" / "bike_weather_raw_curated_dag.py"


def test_dag_file_is_valid_python():
    ast.parse(DAG_PATH.read_text(encoding="utf-8"))


def test_dag_contains_required_tasks_and_development_schedule():
    source = DAG_PATH.read_text(encoding="utf-8")
    required_task_ids = {
        "collect_bike_inventory",
        "collect_weather",
        "validate_raw_quality",
        "build_curated_inventory",
        "build_curated_weather",
    }

    for task_id in required_task_ids:
        assert f'task_id="{task_id}"' in source

    assert 'dag_id="bike_weather_raw_curated"' in source
    assert "schedule=None" in source


def test_collection_and_quality_failure_policies_are_declared():
    source = DAG_PATH.read_text(encoding="utf-8")

    assert "retries=2" in source
    assert "timedelta(seconds=60)" in source
    assert "AirflowFailException" in source
    assert "quality_result" in source

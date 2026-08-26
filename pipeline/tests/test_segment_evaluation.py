import json
import pytest
from pipeline.src.modelops.segment_evaluation import calibration_bins, evaluate_segments, hour_bucket, validate_combinations
from pipeline.src.modelops.publish_performance_run import publish_performance_run

def test_hour_boundaries_and_unknown_fixture():
    assert [hour_bucket(hour) for hour in (6,7,9,10,21,22)] == ["NIGHT","COMMUTE_AM","COMMUTE_AM","DAYTIME","EVENING","NIGHT"]
    rows=json.load(open("pipeline/tests/fixtures/segment_evaluation_fixture.json", encoding="utf-8"))["rows"]
    assert all(row["status"] == "UNKNOWN_INSUFFICIENT_SAMPLES" for row in evaluate_segments(rows))
    assert len(calibration_bins(rows)) == 10

def test_combination_count_validation():
    with pytest.raises(ValueError): validate_combinations([{}] * 19)
    with pytest.raises(ValueError): validate_combinations([{}] * 21)

def test_sha_rejected_before_database_access():
    with pytest.raises(ValueError): publish_performance_run(None, {"artifactSha256":"BAD"})

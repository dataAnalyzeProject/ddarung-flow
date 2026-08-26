import json
import pytest
from pipeline.src.modelops.segment_evaluation import assert_brier_matches_reference, build_performance_payload, calibration_bins, evaluate_segments, hour_bucket
from pipeline.src.modelops.publish_performance_run import publish_performance_run

def test_hour_boundaries_and_unknown_fixture():
    assert [hour_bucket(hour) for hour in (6,7,9,10,21,22)] == ["NIGHT","COMMUTE_AM","COMMUTE_AM","DAYTIME","EVENING","NIGHT"]
    rows=[{**row, "horizonMinutes": 120, "requiredBikeCount": 3} for row in json.load(open("pipeline/tests/fixtures/segment_evaluation_fixture.json", encoding="utf-8"))["rows"]]
    assert all(row["status"] == "UNKNOWN_INSUFFICIENT_SAMPLES" for row in evaluate_segments(rows))
    assert len(calibration_bins(rows)) == 10

def test_combinations_are_calculated_for_all_twenty_and_reference_metrics_are_real():
    rows = []
    for horizon in (60, 120, 180, 240):
        for quantity in (1, 2, 3, 4, 5):
            for index in range(1000):
                rows.append({"horizonMinutes": horizon, "requiredBikeCount": quantity, "timestamp": "2026-08-24T07:00:00Z", "stationSize": "SMALL", "inventoryLevel": "ZERO", "flowType": "OUTFLOW", "probability": .2 if index % 2 == 0 else .8, "actual": 0 if index % 2 == 0 else 1})
    payload = build_performance_payload(rows)
    assert len(payload["combinations"]) == 20
    reference = next(row for row in payload["combinations"] if row["horizonMinutes"] == 120 and row["requiredBikeCount"] == 3)
    assert reference["sampleCount"] == 1000 and reference["brierScore"] == pytest.approx(.04)
    assert all(row["status"] == "OK" for row in payload["segments"])
    assert_brier_matches_reference(payload["combinations"], payload["combinations"])
    changed = [dict(row) for row in payload["combinations"]]; changed[0]["brierScore"] += 1e-8
    with pytest.raises(ValueError): assert_brier_matches_reference(payload["combinations"], changed)

def test_sha_rejected_before_database_access():
    with pytest.raises(ValueError): publish_performance_run(None, {"artifactSha256":"BAD"})

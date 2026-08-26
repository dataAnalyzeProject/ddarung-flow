import json
import pytest
from pipeline.src.modelops.segment_evaluation import assert_brier_matches_reference, build_performance_payload, calibration_bins, evaluate_combinations, evaluate_segments, hour_bucket
from pipeline.src.modelops.publish_performance_run import publish_performance_run

def test_hour_boundaries_and_unknown_fixture():
    assert [hour_bucket(hour) for hour in (6, 7, 9, 10, 16, 17, 19, 20, 21, 22)] == ["NIGHT", "COMMUTE_AM", "COMMUTE_AM", "DAYTIME", "DAYTIME", "COMMUTE_PM", "COMMUTE_PM", "EVENING", "EVENING", "NIGHT"]
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
    reference = json.load(open("pipeline/tests/fixtures/segment_evaluation_fixture.json", encoding="utf-8"))["model51Combinations"]
    assert_brier_matches_reference(reference, reference)
    changed = [dict(row) for row in payload["combinations"]]; changed[0]["brierScore"] += 1e-8
    with pytest.raises(ValueError): assert_brier_matches_reference(payload["combinations"], changed)

def test_sha_rejected_before_database_access():
    with pytest.raises(ValueError): publish_performance_run(None, {"artifactSha256":"BAD"})

def test_segment_metrics_cover_threshold_skill_and_no_shortage():
    rows = [{"horizonMinutes": 120, "requiredBikeCount": 3, "timestamp": "2026-08-24T07:00:00Z", "stationSize": "SMALL", "inventoryLevel": "ZERO", "flowType": "OUTFLOW", "probability": .2, "actual": 1} for _ in range(999)]
    assert evaluate_segments(rows)[0]["status"] == "UNKNOWN_INSUFFICIENT_SAMPLES"
    rows.append({**rows[0], "probability": .8})
    metric = evaluate_segments(rows)[0]
    assert metric["status"] == "OK" and metric["shortageRecall"] is None and metric["skillScore"] is None
    alternating = [{**rows[0], "probability": .2 if index % 2 == 0 else .8, "actual": 0 if index % 2 == 0 else 1} for index in range(1000)]
    assert evaluate_segments(alternating)[0]["skillScore"] > 0
    neutral = [{**row, "probability": .5} for row in alternating]
    assert evaluate_segments(neutral)[0]["skillScore"] == pytest.approx(0)
    worse = [{**row, "probability": 1 - row["probability"]} for row in alternating]
    assert evaluate_segments(worse)[0]["skillScore"] < 0

def test_combinations_reject_missing_or_extra_pairs():
    rows = [{"horizonMinutes": horizon, "requiredBikeCount": quantity, "probability": .5, "actual": 1} for horizon in (60, 120, 180, 240) for quantity in (1, 2, 3, 4, 5)]
    with pytest.raises(ValueError): evaluate_combinations(rows[:-1])
    rows.append({"horizonMinutes": 300, "requiredBikeCount": 1, "probability": .5, "actual": 1})
    with pytest.raises(ValueError): evaluate_combinations(rows)

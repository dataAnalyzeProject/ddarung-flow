import pytest

from pipeline.src.modelops.drift import summarize_drift
from pipeline.src.modelops.promotion import evaluate_promotion


@pytest.mark.skip(reason="TODO(EXP-DATA-2)")
def test_weighted_brier_requires_two_percent_improvement():
    assert evaluate_promotion([], [])["approved"] is False


@pytest.mark.skip(reason="TODO(EXP-DATA-2)")
def test_recall_cannot_drop_more_than_two_percentage_points():
    assert evaluate_promotion([], [])["approved"] is False


@pytest.mark.skip(reason="TODO(EXP-DATA-2)")
def test_range_or_monotonicity_violation_rejects_candidate():
    assert evaluate_promotion([], [])["approved"] is False


@pytest.mark.skip(reason="TODO(EXP-DATA-2)")
def test_missing_drift_input_is_unknown():
    assert summarize_drift([], [])["status"] == "UNKNOWN"

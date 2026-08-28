import copy

import pytest

from pipeline.src.journey.return_data import (
    build_capacity_history,
    build_return_labels,
    fit_station_time_baseline,
    predict_persistence_baseline,
    predict_station_time_baseline,
    resolve_capacity_as_of,
)


def _future(station_id="ST-1", bike_count=6, observed_at="2026-08-01T01:00:00Z"):
    return {"station_id": station_id, "observed_at": observed_at, "bike_count": bike_count}


def test_build_capacity_history_preserves_source_and_half_open_validity():
    history = build_capacity_history(
        [
            {
                "station_id": "ST-1",
                "capacity": 10,
                "as_of": "2026-08-01T00:00:00Z",
                "source": "master-a",
                "source_as_of": "2026-08-01T00:00:00Z",
            },
            {
                "station_id": "ST-1",
                "capacity": 12,
                "as_of": "2026-08-02T00:00:00Z",
                "source": "master-b",
                "source_as_of": "2026-08-02T00:00:00Z",
            },
        ]
    )
    assert history[0]["valid_to"] == "2026-08-02T00:00:00Z"
    assert history[1]["capacity"] == 12
    assert history[1]["source"] == "master-b"


@pytest.mark.parametrize(
    ("target_at", "expected_capacity"),
    [
        ("2026-08-01T23:59:59Z", 10),
        ("2026-08-02T00:00:00Z", 12),
        ("2026-08-02T00:00:01Z", 12),
    ],
)
def test_capacity_change_boundary_is_half_open(target_at, expected_capacity):
    history = build_capacity_history(
        [
            {
                "station_id": "ST-1",
                "capacity": 10,
                "as_of": "2026-08-01T00:00:00Z",
                "source": "master-a",
                "source_as_of": "2026-08-01T00:00:00Z",
            },
            {
                "station_id": "ST-1",
                "capacity": 12,
                "as_of": "2026-08-02T00:00:00Z",
                "source": "master-b",
                "source_as_of": "2026-08-02T00:00:00Z",
            },
        ]
    )
    assert resolve_capacity_as_of(history, "ST-1", target_at)["capacity"] == expected_capacity


def test_capacity_overlap_is_quarantined_as_conflict(capacity_history):
    history = capacity_history + [{**capacity_history[0], "capacity": 11}]
    result = build_return_labels(
        [{"station_id": "ST-1", "target_at": "2026-08-01T01:00:00Z"}],
        [_future()],
        history,
    )
    assert result["labels"] == []
    assert result["quarantine"][0]["reason_code"] == "CAPACITY_CONFLICT"


@pytest.mark.parametrize(
    ("history", "station_id", "reason"),
    [
        ([], "ST-1", "STATION_UNMATCHED"),
        (
            [
                {
                    "station_id": "ST-1",
                    "capacity": 10,
                    "valid_from": "2026-08-02T00:00:00Z",
                    "valid_to": None,
                    "source": "master",
                    "source_as_of": "2026-08-02T00:00:00Z",
                }
            ],
            "ST-1",
            "CAPACITY_MISSING",
        ),
        (
            [
                {
                    "station_id": "ST-1",
                    "capacity": 0,
                    "valid_from": "2026-08-01T00:00:00Z",
                    "valid_to": None,
                    "source": "master",
                    "source_as_of": "2026-08-01T00:00:00Z",
                }
            ],
            "ST-1",
            "INVALID_CAPACITY",
        ),
    ],
)
def test_capacity_resolution_reason_codes(history, station_id, reason):
    assert resolve_capacity_as_of(history, station_id, "2026-08-01T01:00:00Z")["reason_code"] == reason


def test_future_zero_is_a_normal_observation_and_required_counts_one_to_five(
    capacity_history, target_row
):
    result = build_return_labels([target_row], [_future(bike_count=0)], capacity_history)
    assert result["quarantine"] == []
    assert [row["required_empty_dock_count"] for row in result["labels"]] == [1, 2, 3, 4, 5]
    assert all(row["actual_empty_dock_count"] == 10 for row in result["labels"])
    assert all(row["return_available"] == 1 for row in result["labels"])


def test_required_empty_dock_counts_use_the_return_label_formula(
    capacity_history, target_row
):
    result = build_return_labels([target_row], [_future(bike_count=7)], capacity_history)
    assert [row["return_available"] for row in result["labels"]] == [1, 1, 1, 0, 0]


def test_excess_bikes_and_missing_future_are_quarantined(capacity_history, target_row):
    over_capacity = build_return_labels([target_row], [_future(bike_count=11)], capacity_history)
    missing_future = build_return_labels([target_row], [], capacity_history)
    assert over_capacity["quarantine"][0]["reason_code"] == "BIKE_COUNT_EXCEEDS_CAPACITY"
    assert missing_future["quarantine"][0]["reason_code"] == "FUTURE_OBSERVATION_MISSING"


def test_labeling_is_deterministic_and_input_order_independent(capacity_history, target_row):
    targets = [target_row, {"station_id": "ST-1", "target_at": "2026-08-01T02:00:00Z"}]
    observations = [_future(), _future(observed_at="2026-08-01T02:00:00Z", bike_count=4)]
    first = build_return_labels(targets, observations, capacity_history)
    second = build_return_labels(
        list(reversed(copy.deepcopy(targets))),
        list(reversed(copy.deepcopy(observations))),
        list(reversed(copy.deepcopy(capacity_history))),
    )
    assert first == second
    assert first == build_return_labels(targets, observations, capacity_history)


def test_baselines_keep_validation_and_test_out_of_statistical_fit():
    examples = [
        {
            "station_id": "ST-1",
            "target_at": "2026-08-03T01:00:00Z",
            "required_empty_dock_count": 1,
            "return_available": 1,
            "split": "train",
        },
        {
            "station_id": "ST-1",
            "target_at": "2026-08-03T01:00:00Z",
            "required_empty_dock_count": 1,
            "return_available": 0,
            "split": "validation",
        },
        {
            "station_id": "ST-1",
            "target_at": "2026-08-03T01:00:00Z",
            "required_empty_dock_count": 1,
            "return_available": 0,
            "split": "test",
        },
    ]
    model = fit_station_time_baseline(examples)
    assert predict_station_time_baseline(model, examples)[0]["predicted_probability"] == 1.0
    persistence = predict_persistence_baseline(
        [
            {
                "station_id": "ST-1",
                "target_at": "2026-08-03T01:00:00Z",
                "capacity_as_of": 10,
                "current_bike_count": 9,
                "required_empty_dock_count": 1,
            }
        ]
    )
    assert persistence[0]["predicted_probability"] == 1.0

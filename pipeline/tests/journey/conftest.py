import pytest


@pytest.fixture
def capacity_history():
    return [
        {
            "station_id": "ST-1",
            "capacity": 10,
            "valid_from": "2026-08-01T00:00:00Z",
            "valid_to": None,
            "source": "station-master",
            "source_as_of": "2026-08-01T00:00:00Z",
        }
    ]


@pytest.fixture
def target_row():
    return {"station_id": "ST-1", "target_at": "2026-08-01T01:00:00Z"}

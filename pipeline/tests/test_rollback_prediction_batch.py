from uuid import uuid4
from pathlib import Path
import re

import pytest

from pipeline.src.rollback_prediction_batch import deactivate_prediction_batch


class Cursor:
    def __init__(self, rowcount=1):
        self.rowcount = rowcount
        self.closed = False

    def execute(self, statement, parameters):
        self.statement = statement
        self.parameters = parameters

    def close(self):
        self.closed = True


class Connection:
    def __init__(self, rowcount=1):
        self.cursor_instance = Cursor(rowcount)
        self.committed = False
        self.rolled_back = False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def test_deactivate_prediction_batch_is_recoverable_state_change():
    connection = Connection()
    batch_id = uuid4()
    assert deactivate_prediction_batch(connection, batch_id) == {
        "batchId": str(batch_id), "publishStatus": "INACTIVE"
    }
    assert connection.committed is True
    assert connection.cursor_instance.closed is True
    status = re.search(r"publish_status = '([A-Z_]+)'", connection.cursor_instance.statement).group(1)
    enum_source = Path(__file__).parents[2] / "backend/src/main/java/com/ddarungflow/entity/PredictionPublishStatus.java"
    allowed_statuses = set(re.findall(r"^\s*([A-Z_]+),?$", enum_source.read_text(encoding="utf-8"), re.MULTILINE))
    assert status in allowed_statuses


def test_deactivate_rejects_missing_active_batch_without_committing():
    connection = Connection(rowcount=0)
    with pytest.raises(ValueError, match="not found"):
        deactivate_prediction_batch(connection, uuid4())
    assert connection.rolled_back is True

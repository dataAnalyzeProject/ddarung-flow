from uuid import uuid4

import pytest

from pipeline.src.rollback_prediction_batch import deactivate_prediction_batch


class Cursor:
    def __init__(self, rowcount=1):
        self.rowcount = rowcount
        self.closed = False

    def execute(self, *_args):
        pass

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


def test_deactivate_rejects_missing_active_batch_without_committing():
    connection = Connection(rowcount=0)
    with pytest.raises(ValueError, match="not found"):
        deactivate_prediction_batch(connection, uuid4())
    assert connection.rolled_back is True

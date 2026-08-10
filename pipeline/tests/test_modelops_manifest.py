import pytest

from pipeline.src.modelops.evaluation_export import export_metric_rows
from pipeline.src.modelops.manifest import build_model_manifest


@pytest.mark.skip(reason="TODO(EXP-DATA-1): enable after implementation")
def test_manifest_requires_approved_fields():
    assert build_model_manifest({})


@pytest.mark.skip(reason="TODO(EXP-DATA-1): enable after implementation")
def test_metric_export_requires_all_twenty_combinations():
    assert len(export_metric_rows([])) == 20


@pytest.mark.skip(reason="TODO(EXP-DATA-1): enable after implementation")
def test_metric_export_is_deterministic():
    rows = []
    assert export_metric_rows(rows) == export_metric_rows(list(reversed(rows)))

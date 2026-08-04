"""OCI 인증 방식과 Raw 객체 중복방지 계약을 확인한다."""

import json
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import oci
import pytest

from pipeline.src.storage.oci_raw_store import (
    create_object_storage_client,
    write_raw_object_once,
)


OBSERVED_AT = datetime(2026, 8, 3, 9, 0, tzinfo=ZoneInfo("Asia/Seoul"))


class FakeObjectStorageClient:
    def __init__(self, duplicate=False):
        self.duplicate = duplicate
        self.calls = []

    def get_namespace(self):
        return SimpleNamespace(data="test-namespace")

    def put_object(self, namespace, bucket, object_name, body, **kwargs):
        self.calls.append((namespace, bucket, object_name, body, kwargs))
        if self.duplicate:
            raise oci.exceptions.ServiceError(412, "PreconditionFailed", {}, "exists")
        return SimpleNamespace(headers={"etag": "test-etag"})


def test_write_raw_object_uses_same_partition_and_immutable_option():
    client = FakeObjectStorageClient()

    result = write_raw_object_once(
        "bike_inventory",
        OBSERVED_AT,
        OBSERVED_AT,
        {"row": [{"bike_count": 0}]},
        "test-bucket",
        client=client,
    )

    _, bucket, object_name, body, options = client.calls[0]
    stored = json.loads(body.decode("utf-8"))
    assert result["created"] is True
    assert bucket == "test-bucket"
    assert object_name.startswith("raw/bike_inventory/year=2026/month=08/day=03/")
    assert options["if_none_match"] == "*"
    assert stored["payload"]["row"][0]["bike_count"] == 0


def test_write_raw_object_treats_precondition_failure_as_duplicate():
    result = write_raw_object_once(
        "bike_inventory",
        OBSERVED_AT,
        OBSERVED_AT,
        {},
        "test-bucket",
        client=FakeObjectStorageClient(duplicate=True),
    )

    assert result["created"] is False


def test_instance_principal_client_uses_signer(monkeypatch):
    signer = object()
    captured = {}
    monkeypatch.setattr(
        oci.auth.signers,
        "InstancePrincipalsSecurityTokenSigner",
        lambda: signer,
    )

    def fake_client(config, **kwargs):
        captured["config"] = config
        captured["signer"] = kwargs["signer"]
        return "client"

    monkeypatch.setattr(oci.object_storage, "ObjectStorageClient", fake_client)

    assert create_object_storage_client("instance_principal") == "client"
    assert captured == {"config": {}, "signer": signer}


def test_unknown_auth_mode_is_rejected():
    with pytest.raises(ValueError, match="OCI_AUTH_MODE"):
        create_object_storage_client("unknown")

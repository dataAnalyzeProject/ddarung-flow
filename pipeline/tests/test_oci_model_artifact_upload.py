import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from pipeline.src import oci_model_artifact_upload as upload


class Response:
    def __init__(self, body):
        self.data = type("Data", (), {"raw": type("Raw", (), {"stream": lambda _, *args, **kwargs: [body]})()})()


class PreconditionFailed(Exception):
    status = 412


class FakeClient:
    def __init__(self, objects):
        self.objects = objects

    def get_object(self, namespace, bucket, key):
        return Response(self.objects[key])

    def put_object(self, namespace, bucket, key, body, **kwargs):
        if key in self.objects:
            raise PreconditionFailed()
        self.objects[key] = body.read()


def manifest(artifact_sha256):
    return {
        "artifact_sha256": artifact_sha256,
        "horizon_minutes": [60, 120, 180, 240],
        "required_bike_counts": [1, 2, 3, 4, 5],
        "combination_metrics": [{"horizon_minutes": h, "required_bikes": c} for h in [60, 120, 180, 240] for c in [1, 2, 3, 4, 5]],
    }


class ImmutableUploadTests(unittest.TestCase):
    def test_reuses_identical_immutable_json(self):
        payload = {"state": "INACTIVE"}
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        client = FakeClient({"pointer": encoded})
        result = upload.put_immutable_json(client, "ns", "bucket", "pointer", payload)
        self.assertFalse(result["created"])

    def test_rejects_existing_json_body_mismatch(self):
        payload = {"state": "INACTIVE"}
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        client = FakeClient({"pointer": b"x" * len(encoded)})
        with self.assertRaisesRegex(ValueError, "checksum"):
            upload.put_immutable_json(client, "ns", "bucket", "pointer", payload)

    def test_rejects_existing_json_size_mismatch(self):
        payload = {"state": "INACTIVE"}
        client = FakeClient({"pointer": b"x"})
        with self.assertRaisesRegex(ValueError, "size"):
            upload.put_immutable_json(client, "ns", "bucket", "pointer", payload)

    def test_rejects_existing_artifact_body_mismatch_before_manifest_upload(self):
        artifact = b"approved-model"
        approved_sha = hashlib.sha256(artifact).hexdigest()
        old_sha = upload.ARTIFACT_SHA256
        upload.ARTIFACT_SHA256 = approved_sha
        try:
            with tempfile.TemporaryDirectory() as directory:
                artifact_path = Path(directory) / "model.joblib"
                manifest_path = Path(directory) / "manifest.json"
                artifact_path.write_bytes(artifact)
                manifest_path.write_text(json.dumps(manifest(approved_sha)), encoding="utf-8")
                client = FakeClient({upload.DEFAULT_ARTIFACT_KEY: b"x" * len(artifact)})
                with self.assertRaisesRegex(ValueError, "checksum"):
                    upload.upload_model_delivery(client, "ns", "bucket", artifact_path, manifest_path)
        finally:
            upload.ARTIFACT_SHA256 = old_sha

    def test_builds_inactive_pointer_with_approved_scope(self):
        pointer = upload.build_inactive_pointer("artifact", "a" * 64, "manifest", "b" * 64, "version")
        self.assertEqual("INACTIVE", pointer["state"])
        self.assertEqual(20, pointer["support"]["combination_count"])

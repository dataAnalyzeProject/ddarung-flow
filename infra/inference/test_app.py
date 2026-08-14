import hashlib
import os
import tempfile
import unittest
from unittest.mock import Mock

import app


class DownloadAndVerifyTests(unittest.TestCase):
    def test_writes_verified_artifact(self):
        content = b"verified model artifact"
        response = Mock()
        response.data.raw.stream.return_value = [content[:8], content[8:]]
        object_storage = Mock()
        object_storage.get_object.return_value = response
        settings = {
            "OCI_OBJECT_NAMESPACE": "namespace",
            "MODEL_BUCKET": "bucket",
            "MODEL_OBJECT_KEY": "models/data-3.1/model.joblib",
            "MODEL_SHA256": hashlib.sha256(content).hexdigest(),
        }

        with tempfile.NamedTemporaryFile(delete=False) as artifact:
            destination = artifact.name
        try:
            app.download_and_verify(object_storage, settings, destination)
            with open(destination, "rb") as artifact:
                self.assertEqual(content, artifact.read())
        finally:
            os.unlink(destination)

    def test_rejects_checksum_mismatch(self):
        response = Mock()
        response.data.raw.stream.return_value = [b"wrong artifact"]
        object_storage = Mock()
        object_storage.get_object.return_value = response
        settings = {
            "OCI_OBJECT_NAMESPACE": "namespace",
            "MODEL_BUCKET": "bucket",
            "MODEL_OBJECT_KEY": "models/data-3.1/model.joblib",
            "MODEL_SHA256": "0" * 64,
        }

        with tempfile.NamedTemporaryFile(delete=False) as artifact:
            destination = artifact.name
        try:
            with self.assertRaisesRegex(RuntimeError, "checksum"):
                app.download_and_verify(object_storage, settings, destination)
        finally:
            os.unlink(destination)


class SettingsTests(unittest.TestCase):
    def test_rejects_missing_or_invalid_checksum(self):
        with self.assertRaisesRegex(RuntimeError, "Missing"):
            app.settings_from_environment({})
        with self.assertRaisesRegex(RuntimeError, "SHA-256"):
            app.settings_from_environment({
                "OCI_OBJECT_NAMESPACE": "namespace",
                "MODEL_BUCKET": "bucket",
                "MODEL_OBJECT_KEY": "key",
                "MODEL_SHA256": "not-a-digest",
            })

    def test_selects_pointer_mode_only_when_both_pointer_values_are_set(self):
        base = {
            "OCI_OBJECT_NAMESPACE": "namespace",
            "MODEL_BUCKET": "bucket",
            "MODEL_POINTER_KEY": "models/inactive-pointer.json",
            "MODEL_POINTER_SHA256": "a" * 64,
        }
        self.assertEqual("pointer", app.settings_from_environment(base)["MODEL_MODE"])
        with self.assertRaisesRegex(RuntimeError, "set together"):
            app.settings_from_environment({**base, "MODEL_POINTER_SHA256": ""})


class PointerValidationTests(unittest.TestCase):
    def pointer(self):
        return {
            "schema_version": 1,
            "state": "INACTIVE",
            "model_version": "data-3.1-test",
            "artifact": {"key": "models/model.joblib", "sha256": "a" * 64},
            "manifest": {"key": "models/manifest.json", "sha256": "b" * 64},
            "support": {
                "horizon_minutes": [60, 120, 180, 240],
                "required_bike_counts": [1, 2, 3, 4, 5],
                "combination_count": 20,
            },
        }

    def test_rejects_active_pointer(self):
        pointer = self.pointer()
        pointer["state"] = "ACTIVE"
        with self.assertRaisesRegex(RuntimeError, "INACTIVE"):
            app.validate_pointer(pointer)

    def test_rejects_manifest_artifact_or_support_disagreement(self):
        pointer = self.pointer()
        manifest = {
            "artifact_sha256": "c" * 64,
            "horizon_minutes": [60, 120, 180, 240],
            "required_bike_counts": [1, 2, 3, 4, 5],
            "combination_metrics": [{}] * 20,
        }
        with self.assertRaisesRegex(RuntimeError, "artifact SHA-256"):
            app.validate_manifest(manifest, pointer)

    def test_pointer_checksum_failure_stops_before_manifest_or_artifact_download(self):
        response = Mock()
        response.data.raw.stream.return_value = [b"wrong pointer"]
        object_storage = Mock()
        object_storage.get_object.return_value = response
        settings = {
            "OCI_OBJECT_NAMESPACE": "namespace",
            "MODEL_BUCKET": "bucket",
            "MODEL_POINTER_KEY": "models/inactive-pointer.json",
            "MODEL_POINTER_SHA256": "0" * 64,
        }
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            app.load_pointer_model(object_storage, settings)
        self.assertEqual(1, object_storage.get_object.call_count)


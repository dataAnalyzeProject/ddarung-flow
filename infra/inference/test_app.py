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


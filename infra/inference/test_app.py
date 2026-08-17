import hashlib
import os
import tempfile
import unittest
from datetime import datetime, timezone
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

    def test_selects_local_mode_with_checksum(self):
        settings = app.settings_from_environment({
            "MODEL_LOCAL_PATH": "/models/model.joblib",
            "MODEL_SHA256": "a" * 64,
        })
        self.assertEqual("local", settings["MODEL_MODE"])


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


class PredictionTests(unittest.TestCase):
    def bundle(self, probabilities=None):
        model = Mock()
        values = probabilities or [0.9, 0.8, 0.7, 0.6, 0.5] * 4
        model.predict_proba.return_value = [[1.0 - value, value] for value in values]
        return {
            "model": model,
            "model_name": "hist_gradient_boosting",
            "feature_names": list(app.EXPECTED_FEATURE_NAMES),
        }

    def test_returns_twenty_monotonic_probabilities(self):
        bundle = self.bundle([0.5, 0.9, 0.7, 0.6, 0.4] * 4)
        result = app.predict_candidates(
            bundle,
            {"candidates": [{
                "stationId": "ST-4",
                "stationNumber": "00102",
                "currentBikeCount": 11,
                "featureAsOf": "2026-08-17T14:00:00+09:00",
            }]},
            generated_at=datetime(2026, 8, 17, tzinfo=timezone.utc),
            model_sha256="2f2ece729fd4",
        )
        prediction = result["predictions"][0]
        self.assertEqual("NORMAL", prediction["status"])
        self.assertEqual(20, len(prediction["rows"]))
        for start in range(0, 20, 5):
            values = [row["probability"] for row in prediction["rows"][start:start + 5]]
            self.assertEqual(values, sorted(values, reverse=True))
        model_input = bundle["model"].predict_proba.call_args.args[0]
        self.assertEqual([102, 0, 14, 8, 0, 11, 60, 1], list(model_input[0]))

    def test_non_numeric_station_number_is_missing(self):
        result = app.predict_candidates(self.bundle(), {"candidates": [{
            "stationId": "ST-X",
            "stationNumber": "unknown",
            "currentBikeCount": 1,
            "featureAsOf": "2026-08-17T14:00:00+09:00",
        }]})
        self.assertEqual("MISSING", result["predictions"][0]["status"])

    def test_invalid_candidate_count_is_unavailable(self):
        result = app.predict_candidates(self.bundle(), {"candidates": []})
        self.assertEqual("UNAVAILABLE", result["status"])

    def test_invalid_current_bike_count_is_missing(self):
        result = app.predict_candidates(self.bundle(), {"candidates": [{
            "stationId": "ST-4",
            "stationNumber": "102",
            "currentBikeCount": -1,
            "featureAsOf": "2026-08-17T14:00:00+09:00",
        }]})
        self.assertEqual("MISSING", result["predictions"][0]["status"])

    def test_model_error_or_out_of_range_probability_is_unavailable(self):
        failing_bundle = self.bundle()
        failing_bundle["model"].predict_proba.side_effect = RuntimeError("model failed")
        invalid_bundle = self.bundle([1.1] * 20)
        payload = {"candidates": [{
            "stationId": "ST-4",
            "stationNumber": "102",
            "currentBikeCount": 11,
            "featureAsOf": "2026-08-17T14:00:00+09:00",
        }]}
        self.assertEqual("UNAVAILABLE", app.predict_candidates(failing_bundle, payload)["predictions"][0]["status"])
        self.assertEqual("UNAVAILABLE", app.predict_candidates(invalid_bundle, payload)["predictions"][0]["status"])


import hashlib
import json
import os
import sys
import tempfile
import threading
import types
import unittest
from datetime import datetime, timezone
from http.server import HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import Mock, patch

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
        values = probabilities or [0.1, 0.1, 0.1, 0.1, 0.1, 0.5]
        model.predict_proba.return_value = [values] * 4
        model.classes_ = [0, 1, 2, 3, 4, 5]
        return {
            "model": model,
            "model_name": "hist_gradient_boosting_inventory_distribution",
            "bucket_definition": "0,1,2,3,4,5+",
            "feature_columns": list(app.EXPECTED_FEATURE_NAMES),
        }

    def test_returns_twenty_monotonic_probabilities(self):
        bundle = self.bundle([0.1, 0.2, 0.2, 0.1, 0.1, 0.3])
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
        self.assertEqual([102, 0, 14, 8, 0, 11, 60], list(model_input[0]))

    def test_uses_loaded_runtime_model_version_for_predictions(self):
        result = app.predict_candidates(
            self.bundle(),
            {"candidates": [{
                "stationId": "ST-4", "stationNumber": "102", "currentBikeCount": 11,
                "featureAsOf": "2026-08-17T14:00:00+09:00",
            }]},
            model_sha256="a" * 64,
            model_version="data-3.1-runtime-pointer",
        )
        self.assertEqual("data-3.1-runtime-pointer", result["modelVersion"])

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
        invalid_bundle = self.bundle([1.1, 0, 0, 0, 0, 0])
        payload = {"candidates": [{
            "stationId": "ST-4",
            "stationNumber": "102",
            "currentBikeCount": 11,
            "featureAsOf": "2026-08-17T14:00:00+09:00",
        }]}
        self.assertEqual("UNAVAILABLE", app.predict_candidates(failing_bundle, payload)["predictions"][0]["status"])
        self.assertEqual("UNAVAILABLE", app.predict_candidates(invalid_bundle, payload)["predictions"][0]["status"])


class RuntimeModelTests(unittest.TestCase):
    def test_runtime_response_exposes_only_safe_loaded_identity(self):
        bundle = PredictionTests().bundle()
        state = app.model_state(
            bundle,
            "data-3.1-runtime-pointer",
            "a" * 64,
            "verified_inactive_pointer",
            datetime(2026, 8, 31, 0, 0, tzinfo=timezone.utc),
        )
        response = app.runtime_model_response(state)
        self.assertEqual({
            "status", "modelVersion", "artifactSha256", "modelSource", "loadedAt",
            "supportedHorizons", "supportedQuantities",
        }, set(response))
        self.assertEqual("data-3.1-runtime-pointer", response["modelVersion"])
        self.assertEqual("a" * 64, response["artifactSha256"])
        self.assertEqual([60, 120, 180, 240], response["supportedHorizons"])
        self.assertEqual([1, 2, 3, 4, 5], response["supportedQuantities"])


class RuntimeIdentityLoadTests(unittest.TestCase):
    def bundle(self):
        return PredictionTests().bundle()

    def fake_oci(self):
        return types.SimpleNamespace(
            auth=types.SimpleNamespace(signers=types.SimpleNamespace(InstancePrincipalsSecurityTokenSigner=lambda: object())),
            object_storage=types.SimpleNamespace(ObjectStorageClient=lambda *_, **__: object()),
        )

    def test_pointer_load_uses_pointer_identity_not_legacy_environment_checksum(self):
        legacy_sha = "a" * 64
        artifact_sha = "b" * 64
        pointer = {"model_version": "runtime-pointer-version", "artifact": {"sha256": artifact_sha}}
        settings = {
            "MODEL_MODE": "pointer", "MODEL_SHA256": legacy_sha,
            "OCI_OBJECT_NAMESPACE": "namespace", "MODEL_BUCKET": "bucket",
        }
        with patch.dict(sys.modules, {"oci": self.fake_oci(), "joblib": types.SimpleNamespace()}), patch.object(app, "load_pointer_model", return_value=(self.bundle(), pointer)):
            _, identity = app.load_model(settings)
        self.assertNotEqual(legacy_sha, artifact_sha)
        self.assertEqual({
            "model_version": "runtime-pointer-version",
            "artifact_sha256": artifact_sha,
            "model_source": "verified_inactive_pointer",
        }, identity)

    def test_local_and_legacy_load_preserve_actual_artifact_identity_conventions(self):
        bundle = self.bundle()
        local_content = b"verified-local-artifact"
        local_sha = hashlib.sha256(local_content).hexdigest()
        legacy_sha = "c" * 64
        with tempfile.NamedTemporaryFile(delete=False) as artifact:
            artifact.write(local_content)
            local_path = artifact.name
        try:
            joblib = types.SimpleNamespace(load=Mock(return_value=bundle))
            with patch.dict(sys.modules, {"joblib": joblib}):
                _, local_identity = app.load_model({"MODEL_MODE": "local", "MODEL_LOCAL_PATH": local_path, "MODEL_SHA256": local_sha})
            with patch.dict(sys.modules, {"joblib": joblib, "oci": self.fake_oci()}), patch.object(app, "download_and_verify"):
                _, legacy_identity = app.load_model({
                    "MODEL_MODE": "legacy", "MODEL_SHA256": legacy_sha,
                    "OCI_OBJECT_NAMESPACE": "namespace", "MODEL_BUCKET": "bucket", "MODEL_OBJECT_KEY": "private/key",
                })
        finally:
            os.unlink(local_path)
        model_name = bundle["model_name"]
        self.assertEqual({"model_version": f"{model_name}@{local_sha[:12]}", "artifact_sha256": local_sha, "model_source": "local_verified"}, local_identity)
        self.assertEqual({"model_version": f"{model_name}@{legacy_sha[:12]}", "artifact_sha256": legacy_sha, "model_source": "legacy_verified"}, legacy_identity)


class RuntimeHandlerTests(unittest.TestCase):
    def bundle(self):
        return PredictionTests().bundle()

    def start_server(self, state):
        server = HTTPServer(("127.0.0.1", 0), app.InferenceHandler)
        server.model_state = state
        server.health_response = {"status": "healthy"}
        server.settings = {"OCI_OBJECT_NAMESPACE": "namespace", "MODEL_BUCKET": "bucket"}
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server, thread

    def stop_server(self, server, thread):
        server.shutdown()
        server.server_close()
        thread.join()

    def url(self, server, path):
        return f"http://127.0.0.1:{server.server_port}{path}"

    def get_json(self, server, path):
        with urlopen(self.url(server, path)) as response:
            return response.status, json.loads(response.read())

    def post_json(self, server, path, payload):
        request = Request(self.url(server, path), data=json.dumps(payload).encode(), method="POST", headers={"Content-Type": "application/json"})
        with urlopen(request) as response:
            return response.status, json.loads(response.read() or b"{}")

    def state(self, version="runtime-old", sha="a" * 64, loaded_at=datetime(2026, 1, 1, tzinfo=timezone.utc)):
        return app.model_state(self.bundle(), version, sha, "verified_inactive_pointer", loaded_at)

    def fake_oci(self):
        return types.SimpleNamespace(
            auth=types.SimpleNamespace(signers=types.SimpleNamespace(InstancePrincipalsSecurityTokenSigner=lambda: object())),
            object_storage=types.SimpleNamespace(ObjectStorageClient=lambda *_, **__: object()),
        )

    def reload_payload(self):
        return {"pointerKey": "models/active-pointer.json", "pointerSha256": "d" * 64}

    def active_pointer(self, sha="b" * 64):
        return {"model_version": "runtime-new", "artifact": {"sha256": sha}}

    def test_reload_success_atomically_publishes_new_identity_after_smoke(self):
        old_state = self.state()
        server, thread = self.start_server(old_state)
        try:
            with patch.dict(sys.modules, {"oci": self.fake_oci()}), patch.object(app, "load_pointer_model", return_value=(self.bundle(), self.active_pointer())):
                status, _ = self.post_json(server, "/internal/model-reloads", self.reload_payload())
            self.assertEqual(200, status)
            self.assertIsNot(server.model_state, old_state)
            self.assertEqual("runtime-new", server.model_state["model_version"])
            self.assertEqual("b" * 64, server.model_state["artifact_sha256"])
            self.assertEqual("verified_active_pointer", server.model_state["model_source"])
            self.assertNotEqual(old_state["loaded_at"], server.model_state["loaded_at"])
        finally:
            self.stop_server(server, thread)

    def test_reload_failure_returns_503_and_preserves_the_entire_old_state(self):
        old_state = self.state()
        server, thread = self.start_server(old_state)
        try:
            with patch.dict(sys.modules, {"oci": self.fake_oci()}), patch.object(app, "load_pointer_model", side_effect=RuntimeError("invalid pointer")):
                with self.assertRaises(HTTPError) as error:
                    self.post_json(server, "/internal/model-reloads", self.reload_payload())
            self.assertEqual(503, error.exception.code)
            self.assertIs(server.model_state, old_state)
            self.assertEqual("runtime-old", server.model_state["model_version"])
            self.assertEqual("a" * 64, server.model_state["artifact_sha256"])
            self.assertEqual("2026-01-01T00:00:00Z", server.model_state["loaded_at"])
            self.assertIs(old_state["bundle"], server.model_state["bundle"])
        finally:
            self.stop_server(server, thread)

    def test_runtime_readback_http_has_exact_safe_fields_and_matches_predict_model_version(self):
        server, thread = self.start_server(self.state(version="runtime-live"))
        try:
            runtime_status, runtime = self.get_json(server, "/internal/runtime-model")
            predict_status, prediction = self.post_json(server, "/predict", {"candidates": [{
                "stationId": "ST-4", "stationNumber": "102", "currentBikeCount": 1,
                "featureAsOf": "2026-08-17T14:00:00+09:00",
            }]})
            health_status, health = self.get_json(server, "/health")
            self.assertEqual(200, runtime_status)
            self.assertEqual({"status", "modelVersion", "artifactSha256", "modelSource", "loadedAt", "supportedHorizons", "supportedQuantities"}, set(runtime))
            self.assertEqual(200, predict_status)
            self.assertEqual(runtime["modelVersion"], prediction["modelVersion"])
            self.assertEqual(200, health_status)
            self.assertEqual("healthy", health["status"])
            with self.assertRaises(HTTPError) as error:
                self.get_json(server, "/unknown")
            self.assertEqual(404, error.exception.code)
            rendered = json.dumps(runtime)
            for forbidden in ("objectKey", "pointerKey", "MODEL_OBJECT_KEY", "MODEL_POINTER_KEY", "namespace", "bucket", "MODEL_LOCAL_PATH", "token", "credential", "secret"):
                self.assertNotIn(forbidden, rendered)
        finally:
            self.stop_server(server, thread)


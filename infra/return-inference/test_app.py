import json
import threading
import unittest
from http.client import HTTPConnection

import app


VALID_REQUEST = {
    "stationId": "ST-0001",
    "featureAsOf": "2026-08-28T18:20:00+09:00",
    "arrivalAt": "2026-08-28T19:00:00+09:00",
    "horizonMinutes": 40,
    "requiredEmptyDockCount": 2,
    "currentBikeCount": 7,
    "capacity": 20,
}


class ReturnInferenceTests(unittest.TestCase):
    def start_server(self, runtime):
        server = app.create_server(runtime=runtime, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.stop_server, server, thread)
        return server

    def stop_server(self, server, thread):
        server.shutdown()
        thread.join(1)
        server.server_close()

    def request(self, server, method, path, payload=None):
        connection = HTTPConnection("127.0.0.1", server.server_port, timeout=2)
        body = json.dumps(payload) if payload is not None else None
        headers = {"Content-Type": "application/json"} if body else {}
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result = json.loads(response.read())
        connection.close()
        return response.status, result

    def test_unconfigured_health_is_running_but_not_ready(self):
        status, body = self.request(self.start_server(app.Runtime({})), "GET", "/health")
        self.assertEqual(200, status)
        self.assertEqual({"serviceStatus": "RUNNING", "modelStatus": "UNAVAILABLE", "ready": False}, body)

    def test_unconfigured_predict_is_503_without_probabilities(self):
        status, body = self.request(self.start_server(app.Runtime({})), "POST", "/predict", VALID_REQUEST)
        self.assertEqual(503, status)
        self.assertEqual("MODEL_NOT_CONFIGURED", body["errorCode"])
        self.assertNotIn("probabilities", body)
        self.assertNotIn("selectedProbability", body)

    def test_required_empty_dock_count_range_is_enforced(self):
        runtime = app.Runtime({})
        for count in (0, 6, True, "2"):
            with self.subTest(count=count):
                with self.assertRaisesRegex(app.RequestError, "INVALID_REQUIRED_EMPTY_DOCK_COUNT"):
                    runtime.predict({**VALID_REQUEST, "requiredEmptyDockCount": count})

    def test_invalid_request_is_distinct(self):
        status, body = self.request(self.start_server(app.Runtime({})), "POST", "/predict", {"stationId": "ST-1"})
        self.assertEqual(400, status)
        self.assertEqual("INVALID_REQUEST", body["errorCode"])

    def test_monotonicity_violation_is_rejected(self):
        with self.assertRaisesRegex(app.ContractError, "monotonic"):
            app.validate_prediction({"atLeast1": 0.7, "atLeast2": 0.8, "atLeast3": 0.5, "atLeast4": 0.4, "atLeast5": 0.3}, 2)

    def test_test_fixture_is_disabled_by_default_and_in_production(self):
        self.assertEqual("UNAVAILABLE", app.Runtime({}).model_status)
        self.assertEqual("UNAVAILABLE", app.Runtime({"APP_ENV": "production", "RETURN_INFERENCE_TEST_FIXTURE_ENABLED": "1"}).model_status)

    def test_test_fixture_requires_test_environment_and_returns_valid_contract(self):
        runtime = app.Runtime({"APP_ENV": "test", "RETURN_INFERENCE_TEST_FIXTURE_ENABLED": "1"})
        status, body = self.request(self.start_server(runtime), "POST", "/predict", VALID_REQUEST)
        self.assertEqual(200, status)
        self.assertEqual("NORMAL", body["status"])
        self.assertEqual(body["probabilities"]["atLeast2"], body["selectedProbability"])
        self.assertEqual([body["probabilities"][key] for key in app.PROBABILITY_KEYS], sorted((body["probabilities"][key] for key in app.PROBABILITY_KEYS), reverse=True))

    def test_artifact_verification_failure_is_distinct(self):
        runtime = app.Runtime({"RETURN_MODEL_ARTIFACT_PATH": "missing.model", "RETURN_MODEL_ARTIFACT_SHA256": "a" * 64})
        status, body = self.request(self.start_server(runtime), "POST", "/predict", VALID_REQUEST)
        self.assertEqual(503, status)
        self.assertEqual("ARTIFACT_VERIFICATION_FAILED", body["errorCode"])

    def test_predictor_contract_violation_is_distinct(self):
        class InvalidPredictor:
            def predict(self, payload):
                return {"atLeast1": 0.3, "atLeast2": 0.8, "atLeast3": 0.4, "atLeast4": 0.2, "atLeast5": 0.1}

        status, body = self.request(self.start_server(app.Runtime(predictor=InvalidPredictor())), "POST", "/predict", VALID_REQUEST)
        self.assertEqual(503, status)
        self.assertEqual("PREDICTION_CONTRACT_VIOLATION", body["errorCode"])


if __name__ == "__main__":
    unittest.main()

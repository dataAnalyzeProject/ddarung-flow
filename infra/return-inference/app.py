import hashlib
import json
import math
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer


PROBABILITY_KEYS = tuple(f"atLeast{count}" for count in range(1, 6))


class RequestError(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


class ContractError(ValueError):
    pass


def parse_datetime(value, field):
    if not isinstance(value, str) or not value.strip():
        raise RequestError("INVALID_REQUEST")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise RequestError("INVALID_REQUEST") from error
    if parsed.tzinfo is None:
        raise RequestError("INVALID_REQUEST")
    return parsed


def validate_request(payload):
    if not isinstance(payload, dict):
        raise RequestError("INVALID_REQUEST")
    if not isinstance(payload.get("stationId"), str) or not payload["stationId"].strip():
        raise RequestError("INVALID_REQUEST")
    parse_datetime(payload.get("featureAsOf"), "featureAsOf")
    target_field = "arrivalAt" if payload.get("arrivalAt") is not None else "predictionTargetAt"
    parse_datetime(payload.get(target_field), target_field)
    required_count = payload.get("requiredEmptyDockCount")
    if isinstance(required_count, bool) or not isinstance(required_count, int) or not 1 <= required_count <= 5:
        raise RequestError("INVALID_REQUIRED_EMPTY_DOCK_COUNT")
    horizon = payload.get("horizonMinutes")
    if isinstance(horizon, bool) or not isinstance(horizon, int) or horizon <= 0:
        raise RequestError("INVALID_REQUEST")
    current_bikes = payload.get("currentBikeCount")
    capacity = payload.get("capacity")
    if any(isinstance(value, bool) or not isinstance(value, int) for value in (current_bikes, capacity)):
        raise RequestError("INVALID_REQUEST")
    if current_bikes < 0 or capacity <= 0 or current_bikes > capacity:
        raise RequestError("INVALID_REQUEST")
    return payload


def validate_prediction(probabilities, required_count):
    if not isinstance(probabilities, dict) or set(probabilities) != set(PROBABILITY_KEYS):
        raise ContractError("probability keys are invalid")
    values = [probabilities[key] for key in PROBABILITY_KEYS]
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1 for value in values):
        raise ContractError("probability range is invalid")
    if any(values[index] < values[index + 1] for index in range(len(values) - 1)):
        raise ContractError("probabilities are not monotonic")
    return float(values[required_count - 1])


class FixturePredictor:
    def predict(self, payload):
        return {
            "atLeast1": 0.90,
            "atLeast2": 0.76,
            "atLeast3": 0.58,
            "atLeast4": 0.37,
            "atLeast5": 0.19,
        }


class Runtime:
    def __init__(self, environment=None, predictor=None):
        environment = environment if environment is not None else os.environ
        self.predictor = predictor
        self.model_status = "READY" if predictor else "UNAVAILABLE"
        self.error_code = None
        fixture_requested = environment.get("RETURN_INFERENCE_TEST_FIXTURE_ENABLED") == "1"
        if fixture_requested and environment.get("APP_ENV") == "test":
            self.predictor = FixturePredictor()
            self.model_status = "READY"
        artifact_path = environment.get("RETURN_MODEL_ARTIFACT_PATH")
        if artifact_path and not self.predictor:
            self._verify_artifact(artifact_path, environment.get("RETURN_MODEL_ARTIFACT_SHA256"))

    def _verify_artifact(self, artifact_path, expected_sha256):
        try:
            if not expected_sha256 or len(expected_sha256) != 64:
                raise ValueError("missing checksum")
            with open(artifact_path, "rb") as artifact:
                actual_sha256 = hashlib.sha256(artifact.read()).hexdigest()
            if actual_sha256 != expected_sha256:
                raise ValueError("checksum mismatch")
        except (OSError, ValueError):
            self.model_status = "FAILED"
            self.error_code = "ARTIFACT_VERIFICATION_FAILED"

    def health(self):
        return {
            "serviceStatus": "RUNNING",
            "modelStatus": self.model_status,
            "ready": self.model_status == "READY",
        }

    def predict(self, payload):
        validate_request(payload)
        if self.error_code:
            return 503, {"status": "UNAVAILABLE", "errorCode": self.error_code}
        if not self.predictor:
            return 503, {"status": "UNAVAILABLE", "errorCode": "MODEL_NOT_CONFIGURED"}
        try:
            probabilities = self.predictor.predict(payload)
            selected_probability = validate_prediction(probabilities, payload["requiredEmptyDockCount"])
        except ContractError:
            return 503, {"status": "UNAVAILABLE", "errorCode": "PREDICTION_CONTRACT_VIOLATION"}
        response = {
            "stationId": payload["stationId"],
            "featureAsOf": payload["featureAsOf"],
            "predictionTargetAt": payload.get("predictionTargetAt") or payload["arrivalAt"],
            "requiredEmptyDockCount": payload["requiredEmptyDockCount"],
            "selectedProbability": selected_probability,
            "probabilities": probabilities,
            "status": "NORMAL",
        }
        if payload.get("arrivalAt") is not None:
            response["arrivalAt"] = payload["arrivalAt"]
        return 200, response


class ReturnInferenceHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        self.respond(200, self.server.runtime.health())

    def do_POST(self):
        if self.path != "/predict":
            self.send_error(404)
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 65536:
                raise RequestError("INVALID_REQUEST")
            payload = json.loads(self.rfile.read(content_length))
            status, response = self.server.runtime.predict(payload)
        except (json.JSONDecodeError, RequestError) as error:
            code = error.code if isinstance(error, RequestError) else "INVALID_REQUEST"
            status, response = 400, {"status": "UNAVAILABLE", "errorCode": code}
        self.respond(status, response)

    def respond(self, status, response):
        body = json.dumps(response).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


def create_server(runtime=None, port=8082):
    server = HTTPServer(("0.0.0.0", port), ReturnInferenceHandler)
    server.runtime = runtime or Runtime()
    return server


def main():
    port = int(os.environ.get("PORT", "8082"))
    create_server(port=port).serve_forever()


if __name__ == "__main__":
    main()

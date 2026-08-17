import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np

LEGACY_SETTINGS = (
    "OCI_OBJECT_NAMESPACE",
    "MODEL_BUCKET",
    "MODEL_OBJECT_KEY",
    "MODEL_SHA256",
)
POINTER_SETTINGS = ("MODEL_POINTER_KEY", "MODEL_POINTER_SHA256")
SUPPORTED_HORIZONS = (60, 120, 180, 240)
SUPPORTED_QUANTITIES = (1, 2, 3, 4, 5)
EXPECTED_FEATURE_NAMES = (
    "station_id",
    "day_of_week",
    "hour_of_day",
    "month",
    "is_weekend",
    "current_bike_count",
    "horizon_minutes",
    "required_bike_count",
)
KST = timezone(timedelta(hours=9))


def settings_from_environment(environment=os.environ):
    settings = {name: environment.get(name, "") for name in LEGACY_SETTINGS + POINTER_SETTINGS}
    settings["MODEL_LOCAL_PATH"] = environment.get("MODEL_LOCAL_PATH", "")
    if settings["MODEL_LOCAL_PATH"]:
        if not re.fullmatch(r"[0-9a-f]{64}", settings["MODEL_SHA256"]):
            raise RuntimeError("MODEL_SHA256 must be a lowercase SHA-256 digest")
        settings["MODEL_MODE"] = "local"
        return settings
    pointer_values = [settings[name] for name in POINTER_SETTINGS]
    if any(pointer_values) and not all(pointer_values):
        raise RuntimeError("MODEL_POINTER_KEY and MODEL_POINTER_SHA256 must be set together")
    if all(pointer_values):
        required = ("OCI_OBJECT_NAMESPACE", "MODEL_BUCKET") + POINTER_SETTINGS
        mode = "pointer"
    else:
        required = LEGACY_SETTINGS
        mode = "legacy"
    missing = [name for name in required if not settings[name]]
    if missing:
        raise RuntimeError("Missing required model settings: " + ", ".join(missing))
    checksum_name = "MODEL_POINTER_SHA256" if mode == "pointer" else "MODEL_SHA256"
    if not re.fullmatch(r"[0-9a-f]{64}", settings[checksum_name]):
        raise RuntimeError(f"{checksum_name} must be a lowercase SHA-256 digest")
    settings["MODEL_MODE"] = mode
    return settings


def download_and_verify(object_storage, settings, destination):
    response = object_storage.get_object(
        settings["OCI_OBJECT_NAMESPACE"],
        settings["MODEL_BUCKET"],
        settings["MODEL_OBJECT_KEY"],
    )
    digest = hashlib.sha256()
    with open(destination, "wb") as artifact:
        for chunk in response.data.raw.stream(1024 * 1024, decode_content=False):
            digest.update(chunk)
            artifact.write(chunk)
    if digest.hexdigest() != settings["MODEL_SHA256"]:
        raise RuntimeError("Downloaded model checksum does not match MODEL_SHA256")


def download_bytes_and_verify(object_storage, settings, object_key, expected_sha256):
    response = object_storage.get_object(settings["OCI_OBJECT_NAMESPACE"], settings["MODEL_BUCKET"], object_key)
    content = b"".join(response.data.raw.stream(1024 * 1024, decode_content=False))
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise RuntimeError("Downloaded pointer or manifest checksum does not match its expected SHA-256")
    return content


def _require_sha256(value, field):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise RuntimeError(f"pointer {field} must be a lowercase SHA-256 digest")


def validate_pointer(pointer):
    if pointer.get("schema_version") != 1 or pointer.get("state") != "INACTIVE":
        raise RuntimeError("pointer must be schema version 1 and INACTIVE")
    for name in ("artifact", "manifest"):
        entry = pointer.get(name)
        if not isinstance(entry, dict) or not isinstance(entry.get("key"), str) or not entry["key"]:
            raise RuntimeError(f"pointer {name} key is invalid")
        _require_sha256(entry.get("sha256"), f"{name} SHA-256")
    support = pointer.get("support")
    if not isinstance(pointer.get("model_version"), str) or not pointer["model_version"]:
        raise RuntimeError("pointer model_version is invalid")
    if support != {"horizon_minutes": [60, 120, 180, 240], "required_bike_counts": [1, 2, 3, 4, 5], "combination_count": 20}:
        raise RuntimeError("pointer support scope is invalid")
    return pointer


def validate_manifest(manifest, pointer):
    artifact = pointer["artifact"]
    support = pointer["support"]
    if manifest.get("artifact_sha256") != artifact["sha256"]:
        raise RuntimeError("manifest artifact SHA-256 does not match pointer")
    if manifest.get("horizon_minutes") != support["horizon_minutes"]:
        raise RuntimeError("manifest horizon scope does not match pointer")
    if manifest.get("required_bike_counts") != support["required_bike_counts"]:
        raise RuntimeError("manifest bike-count scope does not match pointer")
    combinations = manifest.get("combination_metrics")
    if not isinstance(combinations, list) or len(combinations) != support["combination_count"]:
        raise RuntimeError("manifest combination count does not match pointer")


def load_pointer_model(object_storage, settings):
    pointer = validate_pointer(json.loads(download_bytes_and_verify(object_storage, settings, settings["MODEL_POINTER_KEY"], settings["MODEL_POINTER_SHA256"])))
    manifest = json.loads(download_bytes_and_verify(object_storage, settings, pointer["manifest"]["key"], pointer["manifest"]["sha256"]))
    validate_manifest(manifest, pointer)
    pointer_settings = {**settings, "MODEL_OBJECT_KEY": pointer["artifact"]["key"], "MODEL_SHA256": pointer["artifact"]["sha256"]}
    with tempfile.NamedTemporaryFile(suffix=".joblib") as artifact:
        download_and_verify(object_storage, pointer_settings, artifact.name)
        import joblib
        return joblib.load(artifact.name)


def load_model(settings):
    import joblib

    if settings["MODEL_MODE"] == "local":
        artifact_path = settings["MODEL_LOCAL_PATH"]
        digest = hashlib.sha256()
        with open(artifact_path, "rb") as artifact:
            for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != settings["MODEL_SHA256"]:
            raise RuntimeError("Local model checksum does not match MODEL_SHA256")
        return joblib.load(artifact_path)

    import oci

    signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
    object_storage = oci.object_storage.ObjectStorageClient({}, signer=signer)
    if settings["MODEL_MODE"] == "pointer":
        return load_pointer_model(object_storage, settings)
    with tempfile.NamedTemporaryFile(suffix=".joblib") as artifact:
        download_and_verify(object_storage, settings, artifact.name)
        return joblib.load(artifact.name)


def _model_parts(bundle):
    if not isinstance(bundle, dict):
        raise RuntimeError("model artifact must contain a dictionary")
    model = bundle.get("model")
    feature_names = tuple(bundle.get("feature_names") or ())
    if model is None or feature_names != EXPECTED_FEATURE_NAMES:
        raise RuntimeError("model artifact feature names do not match the approved contract")
    model_name = str(bundle.get("model_name") or "unknown")
    return model, model_name


def _parse_feature_as_of(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("featureAsOf is required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("featureAsOf must include a timezone")
    return parsed.astimezone(KST)


def _candidate_rows(candidate):
    station_number = candidate.get("stationNumber")
    if isinstance(station_number, bool):
        raise ValueError("stationNumber must be numeric")
    try:
        station_number = int(str(station_number).strip())
        current_bike_count = int(candidate.get("currentBikeCount"))
    except (TypeError, ValueError) as exc:
        raise ValueError("stationNumber and currentBikeCount must be integers") from exc
    if station_number <= 0 or current_bike_count < 0:
        raise ValueError("stationNumber must be positive and currentBikeCount must not be negative")
    feature_as_of = _parse_feature_as_of(candidate.get("featureAsOf"))
    day_of_week = feature_as_of.weekday()
    base = (
        station_number,
        day_of_week,
        feature_as_of.hour,
        feature_as_of.month,
        1 if day_of_week >= 5 else 0,
        current_bike_count,
    )
    return [base + (horizon, quantity) for horizon in SUPPORTED_HORIZONS for quantity in SUPPORTED_QUANTITIES]


def predict_candidates(bundle, payload, generated_at=None, model_sha256=""):
    candidates = payload.get("candidates") if isinstance(payload, dict) else None
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= 5:
        return {"status": "UNAVAILABLE", "errorCode": "INVALID_CANDIDATES", "predictions": []}

    model, model_name = _model_parts(bundle)
    generated_at = generated_at or datetime.now(timezone.utc)
    response = []
    for candidate in candidates:
        station_id = candidate.get("stationId") if isinstance(candidate, dict) else None
        try:
            rows = _candidate_rows(candidate)
        except (AttributeError, ValueError):
            response.append({"stationId": station_id, "status": "MISSING", "rows": []})
            continue
        try:
            probabilities = model.predict_proba(np.asarray(rows, dtype=float))[:, 1]
            if (len(probabilities) != 20
                or not np.isfinite(probabilities).all()
                or ((probabilities < 0.0) | (probabilities > 1.0)).any()):
                raise ValueError("model returned invalid probabilities")
            output_rows = []
            offset = 0
            for horizon in SUPPORTED_HORIZONS:
                running = 1.0
                for quantity in SUPPORTED_QUANTITIES:
                    probability = min(running, float(probabilities[offset]))
                    running = probability
                    output_rows.append({
                        "horizonMinutes": horizon,
                        "requiredBikeCount": quantity,
                        "probability": probability,
                    })
                    offset += 1
            response.append({"stationId": station_id, "status": "NORMAL", "rows": output_rows})
        except Exception:
            response.append({"stationId": station_id, "status": "UNAVAILABLE", "rows": []})

    return {
        "status": "NORMAL",
        "modelVersion": f"{model_name}@{model_sha256[:12]}",
        "generatedAt": generated_at.isoformat().replace("+00:00", "Z"),
        "predictions": response,
    }


class InferenceHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(self.server.health_response).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/predict":
            self.send_response(404)
            self.end_headers()
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 65536:
                raise ValueError("invalid content length")
            payload = json.loads(self.rfile.read(length))
            result = predict_candidates(
                self.server.model_bundle,
                payload,
                model_sha256=self.server.model_sha256,
            )
        except Exception:
            result = {"status": "UNAVAILABLE", "errorCode": "INVALID_REQUEST", "predictions": []}
        body = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


def main():
    settings = settings_from_environment()
    model_bundle = load_model(settings)
    _model_parts(model_bundle)
    server = HTTPServer(("0.0.0.0", 8081), InferenceHandler)
    server.model_bundle = model_bundle
    server.model_sha256 = settings["MODEL_SHA256"]
    server.health_response = {"status": "healthy"}
    if settings["MODEL_MODE"] == "pointer":
        server.health_response["model_source"] = "verified_pointer"
    server.serve_forever()


if __name__ == "__main__":
    main()

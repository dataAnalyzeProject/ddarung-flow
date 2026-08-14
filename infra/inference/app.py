import hashlib
import json
import os
import re
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

LEGACY_SETTINGS = (
    "OCI_OBJECT_NAMESPACE",
    "MODEL_BUCKET",
    "MODEL_OBJECT_KEY",
    "MODEL_SHA256",
)
POINTER_SETTINGS = ("MODEL_POINTER_KEY", "MODEL_POINTER_SHA256")


def settings_from_environment(environment=os.environ):
    settings = {name: environment.get(name, "") for name in LEGACY_SETTINGS + POINTER_SETTINGS}
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
    import oci

    signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
    object_storage = oci.object_storage.ObjectStorageClient({}, signer=signer)
    if settings["MODEL_MODE"] == "pointer":
        return load_pointer_model(object_storage, settings)
    with tempfile.NamedTemporaryFile(suffix=".joblib") as artifact:
        download_and_verify(object_storage, settings, artifact.name)
        return joblib.load(artifact.name)


class HealthHandler(BaseHTTPRequestHandler):
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

    def log_message(self, format, *args):
        return


def main():
    settings = settings_from_environment()
    load_model(settings)
    server = HTTPServer(("0.0.0.0", 8081), HealthHandler)
    server.health_response = {"status": "healthy"}
    if settings["MODEL_MODE"] == "pointer":
        server.health_response["model_source"] = "verified_pointer"
    server.serve_forever()


if __name__ == "__main__":
    main()

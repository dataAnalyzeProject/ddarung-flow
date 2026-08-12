import hashlib
import json
import os
import re
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

REQUIRED_SETTINGS = (
    "OCI_OBJECT_NAMESPACE",
    "MODEL_BUCKET",
    "MODEL_OBJECT_KEY",
    "MODEL_SHA256",
)


def settings_from_environment(environment=os.environ):
    settings = {name: environment.get(name, "") for name in REQUIRED_SETTINGS}
    missing = [name for name, value in settings.items() if not value]
    if missing:
        raise RuntimeError("Missing required model settings: " + ", ".join(missing))
    if not re.fullmatch(r"[0-9a-f]{64}", settings["MODEL_SHA256"]):
        raise RuntimeError("MODEL_SHA256 must be a lowercase SHA-256 digest")
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


def load_model(settings):
    import joblib
    import oci

    signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
    object_storage = oci.object_storage.ObjectStorageClient({}, signer=signer)
    with tempfile.NamedTemporaryFile(suffix=".joblib") as artifact:
        download_and_verify(object_storage, settings, artifact.name)
        return joblib.load(artifact.name)


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps({"status": "healthy"}).encode()
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
    server.serve_forever()


if __name__ == "__main__":
    main()

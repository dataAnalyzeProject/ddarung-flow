#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
data_dir="${1:-}"
[[ -n "$data_dir" ]] || { echo "Usage: $0 GRAPH_DATA_DIR" >&2; exit 64; }
[[ -f "$data_dir/graph/valhalla.json" ]] || { echo "FAIL: missing graph config" >&2; exit 1; }
[[ -f "$data_dir/graph/build-manifest.json" ]] || { echo "FAIL: missing graph build manifest" >&2; exit 1; }
find "$data_dir/graph/tiles" -name '*.gph' -print -quit | grep -q . || { echo "FAIL: graph tiles are empty" >&2; exit 1; }
python3 - "$data_dir/graph/build-manifest.json" "$data_dir/graph/valhalla.json" "$root_dir" "$data_dir/graph" <<'PY'
import hashlib, json, re, sys
required = {"valhallaVersion", "runtimeImage", "runtimeImageDigest", "architecture", "osmSource", "osmSourceDate", "osmSha256", "graphVersion", "configSha256", "builtAt", "gitSha", "elevationEnabled", "graphArtifactSha256", "licenseAttribution"}
manifest = json.load(open(sys.argv[1], encoding="utf-8"))
missing = sorted(required - manifest.keys())
sha256 = re.compile(r"^[0-9a-f]{64}$")
image_digest = re.compile(r"^sha256:[0-9a-f]{64}$")
config_digest = hashlib.file_digest(open(sys.argv[2], "rb"), "sha256").hexdigest()
if (missing or manifest["architecture"] != "linux/arm64" or manifest["elevationEnabled"] is not False
        or not image_digest.fullmatch(manifest["runtimeImageDigest"])
        or not sha256.fullmatch(manifest["osmSha256"])
        or not manifest["graphVersion"]
        or not sha256.fullmatch(manifest["configSha256"])
        or not sha256.fullmatch(manifest["graphArtifactSha256"])
        or config_digest != manifest["configSha256"]):
    raise SystemExit("FAIL: invalid graph provenance or config digest")
sys.path.insert(0, sys.argv[3] + "/scripts")
from graph_digest import graph_digest
if graph_digest(__import__("pathlib").Path(sys.argv[4])) != manifest["graphArtifactSha256"]:
    raise SystemExit("FAIL: graph artifact digest mismatch")
print("PASS: graph structure, config digest and artifact provenance are verified")
PY

if [[ -n "${VALHALLA_BASE_URL:-}" ]]; then
  command -v curl >/dev/null || { echo "FAIL: curl is required for runtime health" >&2; exit 1; }
  curl --fail --silent --show-error "${VALHALLA_BASE_URL%/}/status" | python3 -c '
import json, sys
payload = json.load(sys.stdin)
if not isinstance(payload, dict):
    raise SystemExit("FAIL: Valhalla status payload is not an object")
print("PASS: Valhalla status endpoint is reachable")
'
else
  echo "NOT_RUN: set VALHALLA_BASE_URL after private runtime startup to verify health"
fi

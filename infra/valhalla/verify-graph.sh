#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
data_dir="${1:-}"
[[ -n "$data_dir" ]] || { echo "Usage: $0 GRAPH_DATA_DIR" >&2; exit 64; }
[[ -f "$data_dir/graph/valhalla.json" ]] || { echo "FAIL: missing graph config" >&2; exit 1; }
[[ -f "$data_dir/graph/build-manifest.json" ]] || { echo "FAIL: missing graph build manifest" >&2; exit 1; }
find "$data_dir/graph/tiles" -name '*.gph' -print -quit | grep -q . || { echo "FAIL: graph tiles are empty" >&2; exit 1; }
python3 - "$data_dir/graph/build-manifest.json" <<'PY'
import json, sys
required = {"valhallaVersion", "runtimeImage", "runtimeImageDigest", "architecture", "osmSource", "osmSourceDate", "osmSha256", "graphVersion", "configSha256", "builtAt", "gitSha", "elevationEnabled", "graphArtifactSha256", "licenseAttribution"}
manifest = json.load(open(sys.argv[1], encoding="utf-8"))
missing = sorted(required - manifest.keys())
if missing or manifest["architecture"] != "linux/arm64" or manifest["elevationEnabled"] is not False:
    raise SystemExit("FAIL: invalid build manifest")
print("PASS: graph structure and provenance manifest are present")
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

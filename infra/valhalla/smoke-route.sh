#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
base_url="${VALHALLA_BASE_URL:-}"
[[ -n "$base_url" ]] || { echo "Usage: VALHALLA_BASE_URL=http://127.0.0.1:8002 $0 [evidence.json]" >&2; exit 64; }
evidence_path="${1:-valhalla-smoke-evidence.json}"
VALHALLA_SCRIPT_DIR="${root_dir}/scripts" python3 - "$base_url" "$evidence_path" <<'PY'
import json, os, pathlib, sys, urllib.parse, urllib.request

base, output = sys.argv[1:]
script_dir = pathlib.Path(os.environ["VALHALLA_SCRIPT_DIR"])
sys.path.insert(0, str(script_dir))
from route_response import validate_route
routes = [
    ("A", [126.9768, 37.5759], [126.9780, 37.5665]),
    ("B", [126.9325, 37.5269], [126.9951, 37.5085]),
    ("C", [127.0077, 37.5825], [126.9819, 37.5581]),
]
results = []
for label, origin, destination in routes:
    request = {"locations": [{"lon": origin[0], "lat": origin[1]}, {"lon": destination[0], "lat": destination[1]}], "costing": "bicycle", "units": "kilometers"}
    url = base.rstrip("/") + "/route?" + urllib.parse.urlencode({"json": json.dumps(request, separators=(",", ":"))})
    with urllib.request.urlopen(url, timeout=30) as response:
        if response.status != 200: raise RuntimeError(f"{label}: HTTP {response.status}")
        payload = json.load(response)
    result = validate_route(payload, (origin[1], origin[0]), (destination[1], destination[0]))
    results.append({"route": label, "costing": "bicycle", "requestedOrigin": origin, "requestedDestination": destination, **result})
json.dump({"provider": "SELF_HOSTED_VALHALLA", "routes": results}, open(output, "w", encoding="utf-8"), indent=2)
print(f"PASS: Seoul bicycle smoke {len(results)}/3")
PY

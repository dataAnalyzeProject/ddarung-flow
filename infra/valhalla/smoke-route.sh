#!/usr/bin/env bash
set -euo pipefail

base_url="${VALHALLA_BASE_URL:-}"
[[ -n "$base_url" ]] || { echo "Usage: VALHALLA_BASE_URL=http://127.0.0.1:8002 $0 [evidence.json]" >&2; exit 64; }
evidence_path="${1:-valhalla-smoke-evidence.json}"
python3 - "$base_url" "$evidence_path" <<'PY'
import json, math, sys, urllib.parse, urllib.request

base, output = sys.argv[1:]
routes = [
    ("A", [126.9768, 37.5759], [126.9780, 37.5665]),
    ("B", [126.9325, 37.5269], [126.9951, 37.5085]),
    ("C", [127.0077, 37.5825], [126.9819, 37.5581]),
]
def direct(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    return 6371000 * 2 * math.asin(math.sqrt(math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2))
results = []
for label, origin, destination in routes:
    request = {"locations": [{"lon": origin[0], "lat": origin[1]}, {"lon": destination[0], "lat": destination[1]}], "costing": "bicycle", "units": "kilometers"}
    url = base.rstrip("/") + "/route?" + urllib.parse.urlencode({"json": json.dumps(request, separators=(",", ":"))})
    with urllib.request.urlopen(url, timeout=30) as response:
        if response.status != 200: raise RuntimeError(f"{label}: HTTP {response.status}")
        payload = json.load(response)
    trip = payload.get("trip", {})
    summary, legs = trip.get("summary", {}), trip.get("legs", [])
    shape = trip.get("shape", "")
    maneuvers = [m for leg in legs for m in leg.get("maneuvers", [])]
    distance_m = float(summary.get("length", 0)) * 1000
    duration_s = float(summary.get("time", 0))
    if distance_m <= direct(origin, destination) or duration_s <= 0 or len(shape) < 10 or not maneuvers:
        raise RuntimeError(f"{label}: invalid bicycle route response")
    results.append({"route": label, "costing": "bicycle", "distanceMeters": round(distance_m, 1), "durationSeconds": round(duration_s, 1), "shapePresent": True, "maneuverCount": len(maneuvers), "origin": origin, "destination": destination})
json.dump({"provider": "SELF_HOSTED_VALHALLA", "routes": results}, open(output, "w", encoding="utf-8"), indent=2)
print(f"PASS: Seoul bicycle smoke {len(results)}/3")
PY

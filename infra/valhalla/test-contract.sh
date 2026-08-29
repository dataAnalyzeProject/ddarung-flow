#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 -m json.tool "$root_dir/valhalla.json.template" >/dev/null
python3 "$root_dir/scripts/validate_contract.py" "$root_dir/manifests/graph-source.example.json"
python3 - "$root_dir" <<'PY'
import hashlib, json, pathlib, re, subprocess, sys, tempfile
root = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(root / "scripts"))
from graph_digest import graph_digest
from route_response import validate_route
compose = (root / "docker-compose.runtime.yaml").read_text(encoding="utf-8")
assert "ports:" not in compose and "internal: true" in compose and "profiles: [\"valhalla\"]" in compose
source = json.loads((root / "manifests/graph-source.example.json").read_text(encoding="utf-8"))
assert source["architecture"] == "linux/arm64"
assert source["runtimeImageDigest"].startswith("sha256:")
assert source["elevationEnabled"] is False
assert re.fullmatch(r"https://.*south-korea-260828\.osm\.pbf", source["osmSource"])
required_build_fields = {"valhallaVersion", "runtimeImage", "runtimeImageDigest", "architecture", "osmSource", "osmSourceDate", "osmSha256", "graphVersion", "configSha256", "builtAt", "gitSha", "elevationEnabled", "graphArtifactSha256", "licenseAttribution"}
assert required_build_fields <= json.loads((root / "manifests/graph-build.example.json").read_text(encoding="utf-8")).keys()
with tempfile.TemporaryDirectory() as directory:
    directory = pathlib.Path(directory)
    pbf = directory / "source.osm.pbf"
    pbf.write_bytes(b"fixture OSM bytes")
    valid = dict(source, osmSha256=hashlib.sha256(pbf.read_bytes()).hexdigest())
    manifest = directory / "source.json"
    manifest.write_text(json.dumps(valid), encoding="utf-8")
    command = [sys.executable, str(root / "scripts/validate_contract.py"), str(manifest), "--pbf", str(pbf)]
    assert subprocess.run(command, check=False).returncode == 0
    pbf.write_bytes(b"tampered fixture OSM bytes")
    assert subprocess.run(command, check=False).returncode != 0
    valid["osmSourceDate"] = ""
    manifest.write_text(json.dumps(valid), encoding="utf-8")
    assert subprocess.run(command, check=False).returncode != 0

def encode_polyline6(coordinates):
    previous_lat = previous_lon = 0
    output = []
    for latitude, longitude in coordinates:
        for value, previous in ((round(latitude * 1_000_000), previous_lat), (round(longitude * 1_000_000), previous_lon)):
            delta = value - previous
            encoded = ~(delta << 1) if delta < 0 else delta << 1
            while encoded >= 0x20:
                output.append(chr((0x20 | (encoded & 0x1F)) + 63))
                encoded >>= 5
            output.append(chr(encoded + 63))
        previous_lat, previous_lon = round(latitude * 1_000_000), round(longitude * 1_000_000)
    return "".join(output)

origin = (37.5759, 126.9768)
destination = (37.5665, 126.9780)
shape = encode_polyline6([origin, (37.571, 126.977), destination])
route = {"trip": {"summary": {"length": 1.5, "time": 300}, "legs": [{"shape": shape, "maneuvers": [{"type": 1}]}]}}
assert validate_route(route, origin, destination)["shapePointCount"] == 3
invalid = {"trip": {"shape": shape, "summary": {"length": 1.5, "time": 300}, "legs": [{"maneuvers": [{"type": 1}]}]}}
try:
    validate_route(invalid, origin, destination)
except ValueError as error:
    assert "leg" in str(error)
else:
    raise AssertionError("trip.shape must not replace legs[].shape")

with tempfile.TemporaryDirectory() as directory:
    first = pathlib.Path(directory) / "first" / "graph"
    second = pathlib.Path(directory) / "second" / "graph"
    for graph in (first, second):
        (graph / "tiles").mkdir(parents=True)
        (graph / "tiles" / "tile.gph").write_bytes(b"tile bytes")
        (graph / "valhalla.json").write_text('{"mjolnir":{}}', encoding="utf-8")
    assert graph_digest(first) == graph_digest(second)
    config_hash = hashlib.file_digest((first / "valhalla.json").open("rb"), "sha256").hexdigest()
    artifact_hash = graph_digest(first)
    build_manifest = {
        "valhallaVersion": "3.5.1", "runtimeImage": source["runtimeImage"], "runtimeImageDigest": source["runtimeImageDigest"],
        "architecture": "linux/arm64", "osmSource": source["osmSource"], "osmSourceDate": source["osmSourceDate"],
        "osmSha256": "a" * 64, "graphVersion": "fixture-v1", "configSha256": config_hash, "builtAt": "2026-08-30T00:00:00+00:00",
        "gitSha": "b" * 40, "elevationEnabled": False, "graphArtifactSha256": artifact_hash, "licenseAttribution": source["licenseAttribution"],
    }
    (first / "build-manifest.json").write_text(json.dumps(build_manifest), encoding="utf-8")
    verify = ["bash", str(root / "verify-graph.sh"), str(first.parent)]
    assert subprocess.run(verify, check=False).returncode == 0
    (first / "valhalla.json").write_text('{"mjolnir":{"changed":true}}', encoding="utf-8")
    assert subprocess.run(verify, check=False).returncode != 0
    (first / "valhalla.json").write_text('{"mjolnir":{}}', encoding="utf-8")
    assert subprocess.run(verify, check=False).returncode == 0
    (first / "tiles" / "tile.gph").write_bytes(b"mutated tile bytes")
    assert subprocess.run(verify, check=False).returncode != 0
print("PASS: static pin, private-network and fail-closed source-contract checks")
PY

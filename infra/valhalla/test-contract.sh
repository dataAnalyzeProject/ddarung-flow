#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 -m json.tool "$root_dir/valhalla.json.template" >/dev/null
if python3 "$root_dir/scripts/validate_contract.py" "$root_dir/manifests/graph-source.example.json"; then
  echo "FAIL: unverified source SHA was accepted" >&2
  exit 1
fi
python3 - "$root_dir" <<'PY'
import hashlib, json, pathlib, re, subprocess, sys, tempfile
root = pathlib.Path(sys.argv[1])
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
print("PASS: static pin, private-network and fail-closed source-contract checks")
PY

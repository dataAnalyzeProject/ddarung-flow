#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_manifest="${root_dir}/manifests/graph-source.example.json"
data_dir=""

usage() {
  echo "Usage: $0 --data-dir PATH [--source-manifest PATH]" >&2
  exit 64
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data-dir) data_dir="${2:-}"; shift 2 ;;
    --source-manifest) source_manifest="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -n "$data_dir" ]] || usage
command -v docker >/dev/null || { echo "HOLD: Docker CLI is unavailable" >&2; exit 1; }
docker info >/dev/null || { echo "HOLD: Docker daemon is unavailable" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }

python3 "${root_dir}/scripts/validate_contract.py" "$source_manifest"
readarray -t source_values < <(python3 - "$source_manifest" <<'PY'
import json, sys
s = json.load(open(sys.argv[1], encoding="utf-8"))
for key in ("runtimeImage", "runtimeImageDigest", "osmSource", "osmSha256", "graphVersion", "valhallaVersion", "elevationEnabled", "licenseAttribution"):
    print(str(s[key]))
PY
)
runtime_image="${source_values[0]}@${source_values[1]}"
osm_url="${source_values[2]}"
osm_sha256="${source_values[3]}"

mkdir -p "$data_dir/osm" "$data_dir/graph/tiles"
pbf_path="$data_dir/osm/source.osm.pbf"
curl --fail --location --retry 3 --output "$pbf_path" "$osm_url"
python3 "${root_dir}/scripts/validate_contract.py" "$source_manifest" --pbf "$pbf_path"

config_path="$data_dir/graph/valhalla.json"
docker run --rm --platform linux/arm64 --entrypoint valhalla_build_config "$runtime_image" \
  --mjolnir-tile-dir /data/graph/tiles \
  --mjolnir-timezone /data/graph/timezones.sqlite \
  --mjolnir-admin /data/graph/admins.sqlite > "$config_path"
docker run --rm --platform linux/arm64 --entrypoint valhalla_build_timezones \
  -v "$data_dir:/data" "$runtime_image" > "$data_dir/graph/timezones.sqlite"
docker run --rm --platform linux/arm64 --entrypoint valhalla_build_admins \
  -v "$data_dir:/data" "$runtime_image" -c /data/graph/valhalla.json /data/osm/source.osm.pbf
docker run --rm --platform linux/arm64 --entrypoint valhalla_build_tiles \
  -v "$data_dir:/data" "$runtime_image" -c /data/graph/valhalla.json /data/osm/source.osm.pbf

config_sha256="$(sha256sum "$config_path" | awk '{print $1}')"
graph_sha256="$(find "$data_dir/graph" -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
git_sha="$(git -C "$root_dir/../.." rev-parse HEAD)"
python3 - "$source_manifest" "$data_dir/graph/build-manifest.json" "$config_sha256" "$graph_sha256" "$git_sha" <<'PY'
import datetime, json, sys
source = json.load(open(sys.argv[1], encoding="utf-8"))
manifest = {
  "valhallaVersion": source["valhallaVersion"], "runtimeImage": source["runtimeImage"],
  "runtimeImageDigest": source["runtimeImageDigest"], "architecture": source["architecture"],
  "osmSource": source["osmSource"], "osmSourceDate": source["osmSourceDate"],
  "osmSha256": source["osmSha256"], "graphVersion": source["graphVersion"],
  "configSha256": sys.argv[3], "builtAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "gitSha": sys.argv[5], "elevationEnabled": source["elevationEnabled"],
  "graphArtifactSha256": sys.argv[4], "licenseAttribution": source["licenseAttribution"],
}
json.dump(manifest, open(sys.argv[2], "w", encoding="utf-8"), indent=2, sort_keys=True)
print()
PY
echo "PASS: graph built at $data_dir/graph"

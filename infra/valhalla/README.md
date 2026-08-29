# Valhalla Seoul graph bootstrap

This is a component-only, private Valhalla runtime bootstrap. It does not connect Journey backend code, add a public endpoint, display a route in the frontend, or activate staging.

## Fixed runtime candidate

- Valhalla: `3.5.1`
- OCI index: `ghcr.io/valhalla/valhalla@sha256:4ac3d13d1019f9a130e9e6b6924c16ea55da0fa51e3653039152e33ad4095661`
- ARM64 child manifest observed during the ROUTE-1 gate: `sha256:5ce48e9d2b993a7e47c9cd1ced89b95e9e43e0ab073cb00d9509b0845f045500`
- Architecture: `linux/arm64`

The image is pinned by digest; `latest` is forbidden. The official Valhalla build workflow generates a config, timezone and admin data before `valhalla_build_tiles`; this bootstrap follows that sequence. No DEM is supplied, so `elevationEnabled` is always `false`.

## OSM input gate

`manifests/graph-source.example.json` identifies a date-versioned Geofabrik South Korea PBF, which contains Seoul. The source date and URL are fixed, but its `osmSha256` is deliberately `REQUIRED_AT_BOOTSTRAP`: ROUTE-1 did not complete a full-byte SHA-256 calculation in the available environment. This is an intentional fail-closed gate, not an approved graph input.

Before any build, replace that one field with the SHA-256 calculated from the downloaded PBF and run:

```bash
python3 infra/valhalla/scripts/validate_contract.py infra/valhalla/manifests/graph-source.example.json --pbf /path/to/south-korea-260828.osm.pbf
infra/valhalla/bootstrap-graph.sh --data-dir /secure/valhalla-seoul
infra/valhalla/verify-graph.sh /secure/valhalla-seoul
```

The PBF and graph artifacts must stay outside Git. `build-manifest.json` is generated next to the graph and records the input SHA, runtime pin, config hash, graph digest, build time, Git SHA, architecture, elevation setting, and OSM attribution. Keep the source PBF or an immutable object-store copy with the same SHA for later reproduction.

OSM data requires the attribution recorded in the manifest: `© OpenStreetMap contributors, ODbL 1.0`; Geofabrik is the extract supplier. See [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) and [Geofabrik download terms](https://download.geofabrik.de/).

## Private runtime and smoke

`docker-compose.runtime.yaml` has an opt-in `valhalla` profile, an internal-only network and no host `ports` mapping. It is deliberately separate from `infra/staging/docker-compose.yaml` and therefore cannot be included in existing staging CD.

After a verified graph exists, a local operator may bind a temporary loopback-only container for smoke testing. Set its private URL only in the invoking shell, then run:

```bash
VALHALLA_BASE_URL=http://127.0.0.1:8002 infra/valhalla/smoke-route.sh /secure/valhalla-seoul/smoke-evidence.json
```

Use the same private URL with `VALHALLA_BASE_URL=... infra/valhalla/verify-graph.sh /secure/valhalla-seoul` to require a `/status` health response after structural and provenance checks.

The smoke uses three public Seoul landmark-area coordinate pairs and requires a Valhalla `costing=bicycle` response with positive distance/time, shape, maneuvers, and a route distance greater than the straight-line distance. It records no personal location. `ACCESSIBLE` is unsupported; callers must return `UNSUPPORTED_ROUTE_PREFERENCE`, not coerce it to bicycle.

## Static verification and current status

```bash
infra/valhalla/test-contract.sh
git diff --check
```

The static test confirms JSON parsing, the ARM64/digest pin, private-only compose shape, and that a missing or invalid OSM SHA fails. It does not claim graph, runtime health, or route-smoke success.

Current ROUTE-1 result in this checkout is **HOLD — Docker daemon unavailable; verified OSM SHA-256 and actual graph build/runtime smoke NOT_RUN**. `STAGING_RESOURCE_FIT`, backend integration, staging activation, `INTEGRATION_PASS`, and `RELEASE_PASS` remain `NOT_RUN`/not claimed. `JNY-RET-1` remains `HOLD — RETURN_DATA_NOT_READY`.

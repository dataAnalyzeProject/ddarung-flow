#!/usr/bin/env python3
"""Validate the non-secret, versioned input contract before a graph build."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REQUIRED = (
    "valhallaVersion",
    "runtimeImage",
    "runtimeImageDigest",
    "architecture",
    "osmSource",
    "osmSourceDate",
    "osmSha256",
    "graphVersion",
    "elevationEnabled",
    "licenseAttribution",
)
SHA256 = re.compile(r"^[0-9a-f]{64}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")


def load(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid JSON: {error}") from error
    if not isinstance(value, dict):
        raise ValueError("manifest must be a JSON object")
    return value


def validate(source: dict) -> None:
    missing = [field for field in REQUIRED if source.get(field) in (None, "")]
    if missing:
        raise ValueError("missing required fields: " + ", ".join(missing))
    if source["architecture"] != "linux/arm64":
        raise ValueError("architecture must be linux/arm64")
    if source["runtimeImage"].endswith(":latest"):
        raise ValueError("floating latest runtime image is forbidden")
    if not DIGEST.fullmatch(source["runtimeImageDigest"]):
        raise ValueError("runtimeImageDigest must be a sha256 digest")
    if not SHA256.fullmatch(source["osmSha256"]):
        raise ValueError("osmSha256 must be a verified 64-character lowercase SHA-256")
    if not source["osmSource"].startswith("https://"):
        raise ValueError("osmSource must use HTTPS")
    if source["elevationEnabled"] is not False:
        raise ValueError("elevation requires a separately versioned DEM artifact; this contract is disabled")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--pbf", type=Path)
    args = parser.parse_args()
    try:
        source = load(args.manifest)
        validate(source)
        if args.pbf:
            actual = hashlib.file_digest(args.pbf.open("rb"), "sha256").hexdigest()
            if actual != source["osmSha256"]:
                raise ValueError("OSM PBF SHA-256 mismatch")
    except ValueError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print("PASS: source contract is complete and pinned")
    return 0


if __name__ == "__main__":
    sys.exit(main())

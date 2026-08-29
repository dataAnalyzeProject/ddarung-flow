#!/usr/bin/env python3
"""Calculate a location-independent digest for a Valhalla graph directory."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def graph_digest(graph_dir: Path) -> str:
    entries: list[str] = []
    for path in graph_dir.rglob("*"):
        if not path.is_file() or path.name == "build-manifest.json":
            continue
        relative = path.relative_to(graph_dir).as_posix()
        digest = hashlib.file_digest(path.open("rb"), "sha256").hexdigest()
        entries.append(f"{relative}\0{digest}\n")
    if not entries:
        raise ValueError("graph directory has no artifact files")
    return hashlib.sha256("".join(sorted(entries)).encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("graph_dir", type=Path)
    args = parser.parse_args()
    try:
        print(graph_digest(args.graph_dir))
    except (OSError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

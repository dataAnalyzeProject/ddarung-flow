"""Plan and upload the approved historical Raw and Curated OCI objects."""

import argparse
import base64
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import urlopen

import pandas as pd
import oci

from pipeline.src.inventory_cleaning import (
    APPROVED_MANIFEST_SHA256,
    calculate_sha256,
    find_actual_csv_file,
    load_and_verify_manifest,
)
from pipeline.src.storage.oci_raw_store import create_object_storage_client


RAW_PREFIX = "raw/bike-inventory/historical"
CURATED_PREFIX = "curated/bike-inventory/historical"


def _file_metadata(path, object_name, year, kind, row_count=None):
    metadata = {
        "kind": kind,
        "year": int(year),
        "source": str(path),
        "object_name": object_name,
        "size_bytes": os.path.getsize(path),
        "sha256": calculate_sha256(path),
    }
    if row_count is not None:
        metadata["row_count"] = int(row_count)
    return metadata


def _csv_row_count(path):
    newline_count = 0
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
            newline_count += block.count(b"\n")
    return max(0, newline_count - 1)


def build_raw_plan(manifest, data_root, prefix=RAW_PREFIX):
    plan = []
    for row in manifest.to_dict("records"):
        if str(row.get("approved", "true")).lower() not in {"true", "1", "yes"}:
            continue
        if row["canonical_file_policy"] == "EXCLUDE_FILE":
            continue
        source = find_actual_csv_file(data_root, row["file_path"], year=row["year"])
        name = Path(source).name
        object_name = f"{prefix}/{int(row['year'])}/{name}"
        item = _file_metadata(
            source,
            object_name,
            row["year"],
            "raw",
            row_count=row.get("row_count"),
        )
        if item["sha256"] != row["sha256"]:
            raise ValueError(f"manifest checksum mismatch: {name}")
        plan.append(item)
    return plan


def partition_curated(
    curated_path,
    output_dir,
    chunk_rows=500_000,
    allowed_years=(2022, 2024, 2025),
):
    """Write deterministic UTF-8 CSV partitions keyed by Seoul calendar year."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    if any(output_dir.glob("*/part-*.csv")):
        raise FileExistsError("partition directory must be empty for a deterministic run")
    counts = {}
    row_counts = {}
    for chunk in pd.read_csv(curated_path, chunksize=chunk_rows):
        years = (
            pd.to_datetime(chunk["observed_at"], utc=True)
            .dt.tz_convert("Asia/Seoul")
            .dt.year
        )
        unexpected = sorted(set(years.dropna().astype(int)) - set(allowed_years))
        if unexpected:
            raise ValueError(f"Curated contains years outside approved scope: {unexpected}")
        for year, frame in chunk.assign(_year=years).groupby("_year", sort=True):
            year = int(year)
            target_dir = output_dir / str(year)
            target_dir.mkdir(parents=True, exist_ok=True)
            part_no = counts.get((year, "part"), 0)
            target = target_dir / f"part-{part_no:05d}.csv"
            write_header = not target.exists()
            frame.drop(columns=["_year"]).to_csv(
                target, mode="a", header=write_header, index=False, encoding="utf-8"
            )
            row_counts[target] = len(frame)
            counts[(year, "part")] = part_no + 1
    plan = []
    for path in sorted(output_dir.glob("*/part-*.csv")):
        year = int(path.parent.name)
        plan.append(
            _file_metadata(
                path,
                f"{CURATED_PREFIX}/{year}/{path.name}",
                year,
                "curated",
                row_count=row_counts[path],
            )
        )
    return plan


def load_curated_plan(output_dir, allowed_years=(2022, 2024, 2025)):
    output_dir = Path(output_dir)
    paths = sorted(output_dir.glob("*/part-*.csv"))
    if not paths:
        raise FileNotFoundError("no existing Curated partition files found")
    years = {int(path.parent.name) for path in paths}
    unexpected = sorted(years - set(allowed_years))
    if unexpected:
        raise ValueError(f"Curated contains years outside approved scope: {unexpected}")
    return [
        _file_metadata(
            path,
            f"{CURATED_PREFIX}/{int(path.parent.name)}/{path.name}",
            int(path.parent.name),
            "curated",
            row_count=_csv_row_count(path),
        )
        for path in paths
    ]


def _sha256_base64(sha256_hex):
    return base64.b64encode(bytes.fromhex(sha256_hex)).decode("ascii")


def _head_checksum(headers):
    metadata_sha = headers.get("opc-meta-sha256")
    if metadata_sha:
        return metadata_sha.upper()
    encoded_sha = headers.get("opc-content-sha256")
    if encoded_sha:
        return base64.b64decode(encoded_sha).hex().upper()
    return None


def _verify_existing_object(client, namespace, bucket_name, item):
    response = client.head_object(namespace, bucket_name, item["object_name"])
    existing_sha = _head_checksum(response.headers)
    if existing_sha != item["sha256"]:
        raise ValueError(
            f"existing object checksum differs or is unverifiable: {item['object_name']}"
        )
    existing_size = int(response.headers.get("content-length", -1))
    if existing_size != item["size_bytes"]:
        raise ValueError(f"existing object size differs: {item['object_name']}")
    return response.headers.get("etag")


def upload_plan(plan, bucket_name, client, namespace=None, workers=1):
    namespace = namespace or client.get_namespace().data

    def existing_result(item):
        try:
            etag = _verify_existing_object(client, namespace, bucket_name, item)
        except Exception as exc:
            if getattr(exc, "status", None) == 404:
                return None
            raise
        return {
            **item,
            "created": False,
            "verified": True,
            "etag": etag,
        }

    def upload_single(item):
        with open(item["source"], "rb") as body:
            try:
                response = client.put_object(
                    namespace,
                    bucket_name,
                    item["object_name"],
                    body,
                    content_length=item["size_bytes"],
                    content_type="text/csv",
                    expect="100-Continue",
                    if_none_match="*",
                    opc_checksum_algorithm="SHA256",
                    opc_content_sha256=_sha256_base64(item["sha256"]),
                    opc_meta={
                        "sha256": item["sha256"],
                        "row-count": str(item.get("row_count", "")),
                    },
                )
                return {
                    **item,
                    "created": True,
                    "verified": True,
                    "etag": response.headers.get("etag"),
                }
            except Exception as exc:
                status = getattr(exc, "status", None)
                if status != 412:
                    raise
                etag = _verify_existing_object(
                    client, namespace, bucket_name, item
                )
                return {
                    **item,
                    "created": False,
                    "verified": True,
                    "etag": etag,
                }

    with ThreadPoolExecutor(max_workers=workers) as executor:
        existing = list(executor.map(existing_result, plan))
    results_by_name = {
        item["object_name"]: result
        for item, result in zip(plan, existing)
        if result is not None
    }
    pending = [item for item, result in zip(plan, existing) if result is None]
    multipart_threshold = 32 * 1024 * 1024
    large_items = [item for item in pending if item["size_bytes"] >= multipart_threshold]
    small_items = [item for item in pending if item["size_bytes"] < multipart_threshold]

    if large_items:
        upload_manager = oci.object_storage.UploadManager(
            client,
            allow_multipart_uploads=True,
            allow_parallel_uploads=True,
            parallel_process_count=workers,
        )
    for item in large_items:
        try:
            response = upload_manager.upload_file(
                namespace,
                bucket_name,
                item["object_name"],
                item["source"],
                part_size=multipart_threshold,
                content_type="text/csv",
                if_none_match="*",
                opc_checksum_algorithm="SHA256",
                metadata={
                    "sha256": item["sha256"],
                    "row-count": str(item.get("row_count", "")),
                },
            )
            results_by_name[item["object_name"]] = {
                **item,
                "created": True,
                "verified": True,
                "etag": response.headers.get("etag"),
            }
        except Exception as exc:
            if getattr(exc, "status", None) != 412:
                raise
            etag = _verify_existing_object(client, namespace, bucket_name, item)
            results_by_name[item["object_name"]] = {
                **item,
                "created": False,
                "verified": True,
                "etag": etag,
            }

    with ThreadPoolExecutor(max_workers=workers) as executor:
        small_results = list(executor.map(upload_single, small_items))
    results_by_name.update(
        {result["object_name"]: result for result in small_results}
    )
    return [results_by_name[item["object_name"]] for item in plan]


def verify_remote_plan(plan, bucket_name, client, namespace=None, workers=1):
    namespace = namespace or client.get_namespace().data
    def verify_item(item):
        _verify_existing_object(client, namespace, bucket_name, item)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        list(executor.map(verify_item, plan))
    return {"verified_objects": len(plan), "status": "PASS"}


def _response_sha256(response):
    digest = hashlib.sha256()
    stream = response.data.raw
    for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
        digest.update(block)
    return digest.hexdigest().upper()


def verify_read_and_denial(plan, bucket_name, client, namespace=None):
    namespace = namespace or client.get_namespace().data
    samples = []
    for kind in ("raw", "curated"):
        item = min(
            (entry for entry in plan if entry["kind"] == kind),
            key=lambda entry: entry["size_bytes"],
        )
        response = client.get_object(
            namespace, bucket_name, item["object_name"]
        )
        if _response_sha256(response) != item["sha256"]:
            raise ValueError(f"read checksum mismatch: {item['object_name']}")
        samples.append(
            {
                "kind": kind,
                "object_name": item["object_name"],
                "sha256": item["sha256"],
                "status": "PASS",
            }
        )

    denied_item = samples[0]["object_name"]
    denied_url = (
        f"{client.base_client.endpoint.rstrip('/')}/n/"
        f"{quote(namespace, safe='')}/b/{quote(bucket_name, safe='')}/o/"
        f"{quote(denied_item, safe='')}"
    )
    try:
        response = urlopen(denied_url, timeout=30)
    except HTTPError as error:
        denied_status = error.code
    else:
        response.close()
        raise ValueError("unauthenticated object read unexpectedly succeeded")
    if denied_status not in {401, 403, 404}:
        raise ValueError(f"unexpected unauthenticated read status: {denied_status}")
    return {
        "authenticated_reads": samples,
        "unauthenticated_read": {
            "object_name": denied_item,
            "http_status": denied_status,
            "status": "PASS",
        },
    }


def _masked_result(plan, verification=None):
    objects = [
        {key: value for key, value in item.items() if key not in {"source", "etag"}}
        for item in plan
    ]
    return {
        "summary": {
            "status": "PASS",
            "object_count": len(objects),
            "raw_objects": sum(item["kind"] == "raw" for item in objects),
            "curated_objects": sum(item["kind"] == "curated" for item in objects),
            "raw_rows": sum(
                item.get("row_count", 0)
                for item in objects
                if item["kind"] == "raw"
            ),
            "curated_rows": sum(
                item.get("row_count", 0)
                for item in objects
                if item["kind"] == "curated"
            ),
            "created_objects": sum(item.get("created") is True for item in objects),
            "reused_objects": sum(item.get("created") is False for item in objects),
            "verification": verification,
        },
        "objects": objects,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--curated", required=True)
    parser.add_argument("--partition-dir", required=True)
    parser.add_argument("--bucket")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reuse-partitions", action="store_true")
    parser.add_argument("--result-file")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--verify-access", action="store_true")
    args = parser.parse_args()
    manifest = load_and_verify_manifest(args.manifest)
    if calculate_sha256(args.manifest) != APPROVED_MANIFEST_SHA256:
        raise ValueError("approved manifest SHA-256 mismatch")
    plan = build_raw_plan(manifest, args.data_root)
    curated_plan = (
        load_curated_plan(args.partition_dir)
        if args.reuse_partitions
        else partition_curated(args.curated, args.partition_dir)
    )
    plan.extend(curated_plan)
    verification = None
    if not args.dry_run:
        if not args.bucket:
            raise ValueError("--bucket is required for upload")
        client = create_object_storage_client()
        if args.workers < 1 or args.workers > 8:
            raise ValueError("--workers must be between 1 and 8")
        plan = upload_plan(plan, args.bucket, client, workers=args.workers)
        verification = verify_remote_plan(
            plan, args.bucket, client, workers=args.workers
        )
        if args.verify_access:
            verification["access"] = verify_read_and_denial(
                plan, args.bucket, client
            )
    result = _masked_result(plan, verification)
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.result_file:
        Path(args.result_file).write_text(output + "\n", encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()

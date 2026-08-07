import argparse
import gc
import glob
import hashlib
import os

import pandas as pd


APPROVED_MANIFEST_SHA256 = (
    "9075B4EFA89D7370DAB8006BB44579F5F9B215511F16A64AE0B007955FADA9C7"
)
CURATED_COLUMNS = ["station_id", "observed_at", "bike_count"]
QUARANTINE_COLUMNS = [
    "station_id",
    "observed_at",
    "raw_bike_count",
    "bike_count",
]


def calculate_sha256(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as source_file:
        for byte_block in iter(lambda: source_file.read(8 * 1024 * 1024), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest().upper()


def resolve_default_data_root():
    candidates = [
        os.path.join(os.path.expanduser("~"), "Desktop", "dataset"),
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset"
        ),
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return candidates[0]


def resolve_default_manifest(data_root):
    candidates = [
        os.path.join(data_root, "approved_inventory_manifest.csv"),
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "docs",
            "DATA-2.0-output",
            "approved_inventory_manifest.csv",
        ),
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "approved_inventory_manifest.csv",
        ),
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return candidates[0]


def load_and_verify_manifest(manifest_path):
    if not os.path.exists(manifest_path):
        raise FileNotFoundError(f"Manifest does not exist: {manifest_path}")

    manifest = pd.read_csv(manifest_path)
    for old_column, new_column in {
        "relative_path": "file_path",
        "status": "file_policy",
    }.items():
        if old_column in manifest.columns and new_column not in manifest.columns:
            manifest[new_column] = manifest[old_column]

    required_columns = ["file_path", "sha256", "approved"]
    missing_columns = [
        column for column in required_columns if column not in manifest.columns
    ]
    if missing_columns:
        raise ValueError(f"Manifest is missing columns: {missing_columns}")

    if "year" in manifest.columns:
        manifest = manifest[manifest["year"].astype(str) != "2023"].copy()
    return manifest


def find_actual_csv_file(data_root, file_path_str, year=None):
    """Resolve exactly one approved filename, preferring its manifest year folder."""
    base_name = os.path.basename(file_path_str)
    exact_path = os.path.join(data_root, file_path_str)
    if os.path.isfile(exact_path):
        return exact_path

    search_root = data_root
    if year is not None:
        year_roots = [
            path
            for path in glob.glob(os.path.join(data_root, "**", f"*{year}*"), recursive=True)
            if os.path.isdir(path)
        ]
        year_matches = []
        for year_root in year_roots:
            year_matches.extend(
                glob.glob(os.path.join(year_root, "**", base_name), recursive=True)
            )
        year_matches = sorted(set(os.path.abspath(path) for path in year_matches))
        if len(year_matches) == 1:
            return year_matches[0]
        if len(year_matches) > 1:
            raise ValueError(
                f"File resolution is ambiguous for {year}/{base_name}: {year_matches}"
            )

    matches = sorted(
        set(
            os.path.abspath(path)
            for path in glob.glob(
                os.path.join(search_root, "**", base_name), recursive=True
            )
        )
    )
    if not matches:
        raise FileNotFoundError(f"Could not find {base_name} under {data_root}")
    if len(matches) > 1:
        raise ValueError(f"File resolution is ambiguous for {base_name}: {matches}")
    return matches[0]


def _read_inventory_csv(file_path):
    last_error = None
    for encoding in ("cp949", "utf-8-sig", "utf-8"):
        try:
            return pd.read_csv(file_path, encoding=encoding)
        except UnicodeDecodeError as error:
            last_error = error
    raise last_error


def _canonicalize_columns(raw):
    if len(raw.columns) < 5:
        raise ValueError("Inventory CSV must contain at least five columns")
    return raw.rename(
        columns={
            raw.columns[0]: "observed_date",
            raw.columns[1]: "station_id",
            raw.columns[2]: "station_name",
            raw.columns[3]: "hour",
            raw.columns[4]: "raw_bike_count",
        }
    )


def _append_csv(frame, path, columns, write_header):
    if frame.empty:
        return write_header
    frame.loc[:, columns].to_csv(
        path,
        mode="w" if write_header else "a",
        header=write_header,
        index=False,
        encoding="utf-8-sig" if write_header else "utf-8",
    )
    return False


def clean_inventory_dataset(
    manifest_path=None,
    data_root=None,
    output_dir="output",
    expected_manifest_sha=APPROVED_MANIFEST_SHA256,
):
    """Verify and clean one approved source file at a time.

    Only one raw file and its cleaned subset are held in memory. Curated and
    quarantine rows are appended to temporary CSVs and atomically published
    after every approved file succeeds.
    """
    data_root = data_root or resolve_default_data_root()
    manifest_path = manifest_path or resolve_default_manifest(data_root)
    if expected_manifest_sha:
        actual_manifest_sha = calculate_sha256(manifest_path)
        if actual_manifest_sha != expected_manifest_sha.upper():
            raise ValueError(
                "Approved manifest SHA-256 mismatch: "
                f"actual={actual_manifest_sha}, expected={expected_manifest_sha}"
            )

    manifest = load_and_verify_manifest(manifest_path)
    os.makedirs(output_dir, exist_ok=True)
    curated_path = os.path.join(output_dir, "curated_inventory.csv")
    quarantine_path = os.path.join(output_dir, "quarantine_inventory.csv")
    reconciliation_path = os.path.join(output_dir, "row_reconciliation_summary.csv")
    curated_temp = curated_path + ".tmp"
    quarantine_temp = quarantine_path + ".tmp"

    for temp_path in (curated_temp, quarantine_temp):
        if os.path.exists(temp_path):
            os.remove(temp_path)

    reconciliation_rows = []
    curated_header = True
    quarantine_header = True

    try:
        for _, manifest_row in manifest.iterrows():
            relative_path = str(manifest_row["file_path"])
            expected_sha = str(manifest_row["sha256"]).strip().upper()
            approved = str(manifest_row.get("approved", "true")).strip().lower()
            approved = approved in {"true", "1", "t", "y", "yes"}
            policy = str(manifest_row.get("file_policy", "RECOMMENDED")).upper()
            if (
                not approved
                or "EXCLUDED" in policy
                or "2407" in relative_path
                or "2408" in relative_path
            ):
                continue

            year = manifest_row.get("year")
            actual_file = find_actual_csv_file(data_root, relative_path, year=year)
            actual_sha = calculate_sha256(actual_file)
            if actual_sha != expected_sha:
                raise ValueError(
                    f"SHA-256 mismatch for {relative_path}: "
                    f"actual={actual_sha}, expected={expected_sha}"
                )

            raw = _canonicalize_columns(_read_inventory_csv(actual_file))
            raw_count = len(raw)
            raw["observed_at"] = pd.to_datetime(
                raw["observed_date"].astype(str)
                + " "
                + raw["hour"].astype(str)
                + ":00:00",
                errors="coerce",
            )
            raw["bike_count"] = pd.to_numeric(
                raw["raw_bike_count"], errors="coerce"
            )
            zero_count = int((raw["bike_count"] == 0).sum())
            missing_count = int(raw["bike_count"].isna().sum())
            valid = raw[
                raw["observed_at"].notna()
                & raw["bike_count"].notna()
                & (raw["bike_count"] >= 0)
            ].copy()

            conflict_counts = valid.groupby(
                ["station_id", "observed_at"], sort=False
            )["bike_count"].transform("nunique")
            conflict_mask = conflict_counts > 1
            quarantine = valid.loc[conflict_mask].copy()
            clean = valid.loc[~conflict_mask].copy()
            before_deduplication = len(clean)
            clean = clean.drop_duplicates(["station_id", "observed_at"], keep="first")
            duplicate_removed = before_deduplication - len(clean)

            curated_header = _append_csv(
                clean, curated_temp, CURATED_COLUMNS, curated_header
            )
            quarantine_header = _append_csv(
                quarantine,
                quarantine_temp,
                QUARANTINE_COLUMNS,
                quarantine_header,
            )
            reconciliation_rows.append(
                {
                    "file_name": os.path.basename(actual_file),
                    "raw_rows": raw_count,
                    "clean_rows": len(clean),
                    "quarantine_rows": len(quarantine),
                    "duplicate_removed": duplicate_removed,
                    "zero_count": zero_count,
                    "missing_count": missing_count,
                }
            )
            del raw, valid, quarantine, clean, conflict_counts
            gc.collect()

        if curated_header:
            pd.DataFrame(columns=CURATED_COLUMNS).to_csv(
                curated_temp, index=False, encoding="utf-8-sig"
            )
        if quarantine_header:
            pd.DataFrame(columns=QUARANTINE_COLUMNS).to_csv(
                quarantine_temp, index=False, encoding="utf-8-sig"
            )
        os.replace(curated_temp, curated_path)
        os.replace(quarantine_temp, quarantine_path)
    except Exception:
        for temp_path in (curated_temp, quarantine_temp):
            if os.path.exists(temp_path):
                os.remove(temp_path)
        raise

    reconciliation = pd.DataFrame(reconciliation_rows)
    reconciliation.to_csv(reconciliation_path, index=False, encoding="utf-8-sig")
    print(f"[Inventory Cleaning] wrote {curated_path}")
    print(f"[Inventory Cleaning] wrote {quarantine_path}")
    print(reconciliation.to_string(index=False))
    return curated_path, quarantine_path, reconciliation


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DATA-2.1 inventory cleaning")
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--data-root", default=None)
    parser.add_argument("--output-dir", default="output")
    arguments = parser.parse_args()
    clean_inventory_dataset(
        manifest_path=arguments.manifest,
        data_root=arguments.data_root,
        output_dir=arguments.output_dir,
    )

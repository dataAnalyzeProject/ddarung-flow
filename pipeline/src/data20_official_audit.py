"""Rebuild DATA-2.0 quality evidence from extracted OA-22382 CSV files.

This is the leader-owned reproducibility path. The assignee's historical
``data_source_audit.py`` remains unchanged for contribution traceability.
"""

import argparse
import csv
import hashlib
import json
import shutil
from pathlib import Path

import duckdb


YEARS = (2022, 2023, 2024, 2025)
HORIZONS = (1, 2, 3, 4)
THRESHOLDS = (1, 2, 3, 4, 5)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def detect_year(path):
    for part in path.parts:
        if part[:4].isdigit() and int(part[:4]) in YEARS:
            return int(part[:4])
    name = path.stem
    if name.startswith("data_") and name[5:7].isdigit():
        return 2000 + int(name[5:7])
    if name[:2].isdigit():
        return 2000 + int(name[:2])
    raise ValueError(f"year not found: {path}")


def source_rows(path):
    last_error = None
    for encoding in ("cp949", "utf-8-sig"):
        try:
            handle = path.open(encoding=encoding, newline="")
            reader = csv.reader(handle)
            first = next(reader)
            has_header = bool(first and first[0].strip() in {"일시", "날짜", "대여일자"})
            if not has_header:
                yield encoding, has_header, first
            for row in reader:
                yield encoding, has_header, row
            handle.close()
            return
        except (UnicodeDecodeError, StopIteration) as exc:
            last_error = exc
    raise ValueError(f"cannot decode {path}: {last_error}")


def normalize_file(source, relative_path, staging_root):
    target = staging_root / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    invalid_time = invalid_bike = missing_bike = negative_bike = zero_bike = 0
    raw_rows = 0
    encoding = None
    has_header = None

    with target.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(("observed_at", "station_id", "bike_count"))
        for detected_encoding, detected_header, row in source_rows(source):
            encoding, has_header = detected_encoding, detected_header
            if len(row) < 5:
                invalid_time += 1
                continue
            raw_rows += 1
            date_value = row[0].strip()
            station_id = row[1].strip().lstrip("0") or "0"
            hour_value = row[3].strip()
            bike_value = row[4].strip()
            if not bike_value:
                missing_bike += 1
                continue
            try:
                hour = int(float(hour_value))
                bike = int(float(bike_value))
            except ValueError:
                invalid_bike += 1
                continue
            if not 0 <= hour <= 23:
                invalid_time += 1
                continue
            if bike < 0:
                negative_bike += 1
            if bike == 0:
                zero_bike += 1
            writer.writerow((f"{date_value} {hour:02d}:00:00", station_id, bike))

    return {
        "encoding": encoding,
        "has_header": has_header,
        "raw_rows": raw_rows,
        "zero_bike_rows": zero_bike,
        "missing_bike_rows": missing_bike,
        "negative_bike_rows": negative_bike,
        "invalid_time_rows": invalid_time,
        "invalid_bike_rows": invalid_bike,
        "normalized_path": target,
    }


def write_query(connection, output_dir, name, query):
    destination = (output_dir / name).as_posix().replace("'", "''")
    connection.execute(
        f"COPY ({query}) TO '{destination}' (HEADER, DELIMITER ',', QUOTE '\"')"
    )


def load_station_master(connection, path):
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(payload, dict):
        for key in ("DATA", "data", "rows", "stations"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
    station_ids = set()
    for row in payload:
        value = row.get("RENT_NO") or row.get("station_id") or row.get("대여소번호")
        if value is not None:
            station_ids.add(str(value).strip().lstrip("0") or "0")
    connection.execute("CREATE TABLE station_master(station_id VARCHAR PRIMARY KEY)")
    connection.executemany("INSERT INTO station_master VALUES (?)", [(x,) for x in sorted(station_ids)])


def build(args):
    input_root = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()
    work_dir = args.work_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if work_dir.exists():
        shutil.rmtree(work_dir)
    staging = work_dir / "utf8"
    staging.mkdir(parents=True)

    connection = duckdb.connect(str(work_dir / "audit.duckdb"))
    connection.execute("""
        CREATE TABLE file_keys(
            year INTEGER, source_file VARCHAR, observed_at TIMESTAMP,
            station_id VARCHAR, row_count BIGINT, distinct_bike_count BIGINT,
            min_bike INTEGER, max_bike INTEGER
        )
    """)
    profiles = []
    schemas = []

    sources = sorted(input_root.rglob("*.csv"))
    if len(sources) != 60:
        raise ValueError(f"expected 60 CSV files, found {len(sources)}")

    for source in sources:
        relative = source.relative_to(input_root)
        year = detect_year(relative)
        stats = normalize_file(source, relative, staging)
        normalized = stats.pop("normalized_path")
        escaped = normalized.as_posix().replace("'", "''")
        connection.execute(
            "INSERT INTO file_keys "
            f"SELECT {year}, ?, try_cast(observed_at AS TIMESTAMP), station_id, "
            "count(*), count(DISTINCT bike_count), min(bike_count), max(bike_count) "
            f"FROM read_csv_auto('{escaped}', header=true) "
            "WHERE try_cast(observed_at AS TIMESTAMP) IS NOT NULL "
            "GROUP BY observed_at, station_id",
            [str(relative)],
        )
        profile = connection.execute(
            """SELECT min(observed_at), max(observed_at), sum(row_count),
                      count(DISTINCT station_id), count(*),
                      sum(row_count > 1), sum(distinct_bike_count > 1),
                      sum(row_count - 1)
               FROM file_keys WHERE year=? AND source_file=?""",
            [year, str(relative)],
        ).fetchone()
        profiles.append((year, str(relative), *profile, stats["zero_bike_rows"],
                         stats["missing_bike_rows"], stats["negative_bike_rows"],
                         stats["invalid_time_rows"], stats["invalid_bike_rows"]))
        schemas.append((year, str(relative), stats["encoding"], stats["has_header"], 5))

    connection.execute("""
        CREATE TABLE canonical AS
        SELECT year, observed_at, station_id,
               CASE WHEN min(min_bike)=max(max_bike) THEN min(min_bike) END AS bike_count,
               sum(row_count) AS source_rows,
               CASE WHEN min(min_bike)=max(max_bike) THEN 1 ELSE 2 END AS observed_value_groups
        FROM file_keys GROUP BY year, observed_at, station_id
    """)
    load_station_master(connection, args.station_master)

    with (output_dir / "file_profile.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(("year", "source_file", "period_start", "period_end", "raw_rows",
                         "station_count", "time_key_count", "duplicate_key_count",
                         "conflicting_key_count", "excess_duplicate_rows", "zero_bike_rows",
                         "missing_bike_rows", "negative_bike_rows", "invalid_time_rows",
                         "invalid_bike_rows"))
        writer.writerows(profiles)
    with (output_dir / "schema_diff.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(("year", "file", "encoding", "has_header", "canonical_column_count"))
        writer.writerows(schemas)

    write_query(connection, output_dir, "duplicate_conflict_summary.csv", """
        SELECT count(*) valid_key_count, sum(row_count>1) duplicate_key_count,
               sum(row_count-1) excess_duplicate_rows,
               sum(distinct_bike_count>1) conflicting_key_count,
               sum(CASE WHEN distinct_bike_count>1 THEN row_count ELSE 0 END) conflicting_rows,
               max(row_count) max_key_multiplicity, year, source_file file
        FROM file_keys GROUP BY year,source_file ORDER BY year,source_file
    """)
    write_query(connection, output_dir, "year_comparison.csv", """
        WITH f AS (
          SELECT year,count(DISTINCT source_file) file_count,min(observed_at) period_start,
                 max(observed_at) period_end,sum(row_count) raw_rows,count(*) time_key_count,
                 sum(row_count>1) duplicate_key_count,sum(distinct_bike_count>1) conflicting_key_count
          FROM file_keys GROUP BY year
        ), c AS (
          SELECT year,count(*) canonical_rows,count(DISTINCT station_id) station_count,
                 sum(bike_count=0) zero_count,sum(bike_count IS NULL) conflict_count
          FROM canonical GROUP BY year
        )
        SELECT f.*,c.canonical_rows,c.station_count,c.zero_count,0 missing_count,0 negative_count,
               f.duplicate_key_count,f.conflicting_key_count,
               round(100.0*(f.time_key_count-f.conflicting_key_count)/f.time_key_count,6) conflict_free_key_percent
        FROM f JOIN c USING(year) ORDER BY year
    """)
    write_query(connection, output_dir, "horizon_availability.csv", """
        WITH base AS (SELECT * FROM canonical WHERE observed_value_groups=1), h(horizon_hours) AS (VALUES (1),(2),(3),(4))
        SELECT b.year,h.horizon_hours,count(*) base_count,count(f.station_id) matched_count,
               count(*)-count(f.station_id) missing_future_count,
               round(100.0*count(f.station_id)/count(*),6) availability_percent,
               sum(CASE WHEN f.bike_count=0 THEN 1 ELSE 0 END) zero_future_count
        FROM base b CROSS JOIN h LEFT JOIN base f ON f.year=b.year AND f.station_id=b.station_id
          AND f.observed_at=b.observed_at+h.horizon_hours*INTERVAL 1 HOUR
        GROUP BY b.year,h.horizon_hours ORDER BY b.year,h.horizon_hours
    """)
    write_query(connection, output_dir, "required_bike_distribution.csv", """
        WITH base AS (SELECT * FROM canonical WHERE observed_value_groups=1),
        h(horizon_hours) AS (VALUES (1),(2),(3),(4)), t(required_bikes) AS (VALUES (1),(2),(3),(4),(5))
        SELECT b.year,h.horizon_hours,t.required_bikes,count(f.station_id) denominator,
               sum(f.bike_count>=t.required_bikes) success_count,
               round(100.0*sum(f.bike_count>=t.required_bikes)/count(f.station_id),6) success_percent
        FROM base b CROSS JOIN h CROSS JOIN t JOIN base f ON f.year=b.year AND f.station_id=b.station_id
          AND f.observed_at=b.observed_at+h.horizon_hours*INTERVAL 1 HOUR
        GROUP BY b.year,h.horizon_hours,t.required_bikes ORDER BY 1,2,3
    """)
    write_query(connection, output_dir, "station_coverage.csv", """
        WITH x AS (
          SELECT c.year,count(*) observation_key_count,count(sm.station_id) matched_observation_key_count,
                 count(DISTINCT c.station_id) station_count,
                 count(DISTINCT CASE WHEN sm.station_id IS NOT NULL THEN c.station_id END) matched_station_count
          FROM canonical c LEFT JOIN station_master sm USING(station_id)
          WHERE c.observed_value_groups=1 GROUP BY c.year
        ), s25 AS (SELECT DISTINCT station_id FROM canonical WHERE year=2025 AND observed_value_groups=1),
        common AS (
          SELECT c.year,count(DISTINCT s25.station_id) common_with_2025_station_count
          FROM canonical c LEFT JOIN s25 USING(station_id) WHERE c.observed_value_groups=1 GROUP BY c.year
        )
        SELECT x.*,round(100.0*matched_observation_key_count/observation_key_count,6) observation_match_percent,
               round(100.0*matched_station_count/station_count,6) station_match_percent,
               common.common_with_2025_station_count,
               round(100.0*common.common_with_2025_station_count/station_count,6) common_with_2025_percent
        FROM x JOIN common USING(year) ORDER BY year
    """)
    print(f"DATA-2.0 evidence rebuilt from {len(sources)} official CSV files: {output_dir}")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--station-master", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())

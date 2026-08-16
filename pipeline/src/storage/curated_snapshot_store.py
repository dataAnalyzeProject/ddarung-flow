"""정규화(curated) 10분 재고 스냅샷을 Parquet으로 저장한다.

DEC-013: 정규화 데이터는 Parquet(snappy)로 저장한다. Raw 대비 약 13분의
1 크기이며 향후 10분 모델 훈련 시 컬럼형 로딩에 유리하다.

DEC-010에 따라 시간당 집계는 정각(HH:00) cycle의 정규화 스냅샷을 그대로
채택하므로, 이 모듈의 writer를 정각 cycle에도 동일하게 재사용한다.
별도의 집계 writer는 두지 않는다.
"""

import io
from datetime import datetime
from pathlib import Path

import pandas as pd

CURATED_SNAPSHOT_COLUMNS = [
    "station_id",
    "station_name",
    "observed_at",
    "bike_count",
    "rack_count",
    "latitude",
    "longitude",
    "collected_at",
]


def _to_iso(value, field_name):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise ValueError(f"{field_name} must include a timezone")
        return value.isoformat()
    if isinstance(value, str) and value:
        return value
    raise ValueError(f"{field_name} must be a timezone-aware datetime or ISO string")


def _parse_iso(value):
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("observed_at must include a timezone")
    return parsed


def _filename_timestamp(value):
    return value.replace(":", "").replace("+", "p").replace("-", "")


def build_curated_snapshot_record(curated_rows, observed_at, prefix="curated"):
    """Raw와 동일한 key 파티션 규칙으로 정규화 스냅샷의 경로와 프레임을 만든다."""
    observed_iso = _to_iso(observed_at, "observed_at")
    observed = _parse_iso(observed_iso)
    filename = f"observed_{_filename_timestamp(observed_iso)}.parquet"
    relative_path = (
        Path(prefix)
        / f"year={observed:%Y}"
        / f"month={observed:%m}"
        / f"day={observed:%d}"
        / filename
    )
    frame = pd.DataFrame(curated_rows, columns=CURATED_SNAPSHOT_COLUMNS)
    return relative_path, frame


def _frame_to_parquet_bytes(frame):
    buffer = io.BytesIO()
    frame.to_parquet(buffer, compression="snappy", index=False)
    return buffer.getvalue()


def write_curated_snapshot_once_local(curated_rows, observed_at, root_dir, prefix="curated"):
    """정규화 스냅샷을 로컬에 1회만 저장한다. 재실행 시 기존 파일을 보존한다."""
    relative_path, frame = build_curated_snapshot_record(curated_rows, observed_at, prefix)
    path = Path(root_dir) / relative_path
    if path.exists():
        return {"created": False, "path": str(path), "row_count": len(frame)}

    path.parent.mkdir(parents=True, exist_ok=True)
    # 임시 파일에 먼저 쓰고 원자적으로 배치해, 쓰는 도중 프로세스가 죽어도
    # 손상된 파일이 최종 경로에 남지 않게 한다.
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    frame.to_parquet(tmp_path, compression="snappy", index=False)
    if path.exists():
        tmp_path.unlink()
        return {"created": False, "path": str(path), "row_count": len(frame)}
    tmp_path.replace(path)
    return {"created": True, "path": str(path), "row_count": len(frame)}


def write_curated_snapshot_once_oci(
    curated_rows,
    observed_at,
    bucket_name,
    client=None,
    prefix="curated",
):
    """정규화 스냅샷을 OCI Object Storage에 1회만 저장한다.

    oci_raw_store.write_raw_object_once와 동일하게 if_none_match="*"로
    멱등성을 보장한다. 재실행 시 HTTP 412로 거부되고 created=False를 반환한다.
    """
    if not bucket_name:
        raise ValueError("OCI_BUCKET_NAME is required")

    import oci
    from pipeline.src.storage.oci_raw_store import create_object_storage_client

    relative_path, frame = build_curated_snapshot_record(curated_rows, observed_at, prefix)
    object_name = relative_path.as_posix()
    body = _frame_to_parquet_bytes(frame)

    object_client = client or create_object_storage_client()
    namespace = object_client.get_namespace().data
    try:
        response = object_client.put_object(
            namespace,
            bucket_name,
            object_name,
            body,
            content_type="application/vnd.apache.parquet",
            if_none_match="*",
        )
        return {
            "created": True,
            "bucket": bucket_name,
            "object_name": object_name,
            "etag": response.headers.get("etag"),
            "row_count": len(frame),
        }
    except oci.exceptions.ServiceError as exc:
        if exc.status == 412:
            return {
                "created": False,
                "bucket": bucket_name,
                "object_name": object_name,
                "etag": None,
                "row_count": len(frame),
            }
        raise

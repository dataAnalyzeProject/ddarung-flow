"""개발용 Raw JSON을 중복 없이 저장하는 로컬 저장소."""

import json
from datetime import datetime
from pathlib import Path


def _to_iso(value, field_name):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise ValueError(f"{field_name} must include a timezone")
        return value.isoformat()
    if isinstance(value, str) and value:
        return value
    raise ValueError(f"{field_name} must be a timezone-aware datetime or ISO string")


def _parse_iso(value):
    # 파티션 날짜는 관측시각을 사용하므로 저장 전에 ISO 시각을 검증한다.
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("observed_at must include a timezone")
    return parsed


def _filename_timestamp(value):
    # Windows 파일명에서 사용할 수 없는 ':' 등을 제거한다.
    return value.replace(":", "").replace("+", "p").replace("-", "")


def build_raw_record(source, observed_at, collected_at, payload):
    """로컬 파일과 Object Storage가 공유하는 객체 키와 본문을 만든다."""
    if not source or any(char in source for char in ("/", "\\", "..")):
        raise ValueError("source must be a simple non-empty name")
    observed_iso = _to_iso(observed_at, "observed_at")
    collected_iso = _to_iso(collected_at, "collected_at")
    observed = _parse_iso(observed_iso)
    filename = (
        f"observed_{_filename_timestamp(observed_iso)}"
        f"__collected_{_filename_timestamp(collected_iso)}.json"
    )
    relative_path = (
        Path(source)
        / f"year={observed:%Y}"
        / f"month={observed:%m}"
        / f"day={observed:%d}"
        / filename
    )
    envelope = {
        "source": source,
        "observed_at": observed_iso,
        "collected_at": collected_iso,
        "payload": payload,
    }
    return relative_path, envelope


def write_raw_once(source, observed_at, collected_at, payload, root_dir):
    """Write one immutable Raw envelope, returning the existing path on rerun."""

    relative_path, envelope = build_raw_record(
        source, observed_at, collected_at, payload
    )
    path = Path(root_dir) / relative_path
    destination = path.parent
    destination.mkdir(parents=True, exist_ok=True)

    # 'x' 모드는 파일이 이미 있으면 덮어쓰지 않고 FileExistsError를 발생시킨다.
    # 따라서 같은 키의 재실행은 기존 Raw를 보존하고 created=False를 반환한다.
    try:
        with path.open("x", encoding="utf-8") as output:
            json.dump(envelope, output, ensure_ascii=False, indent=2, sort_keys=True)
            output.write("\n")
        created = True
    except FileExistsError:
        created = False

    return {"created": created, "path": str(path)}

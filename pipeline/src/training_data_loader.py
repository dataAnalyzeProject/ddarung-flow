"""정규화 10분 스냅샷을 훈련용 DataFrame으로 읽는 단일 진입점.

훈련 코드는 이 모듈의 load_normalized_snapshots()만 호출하고 저장 형식
(현재 Parquet)을 직접 알지 못한다. 나중에 저장 형식을 바꾸더라도 이
함수 내부만 교체하면 훈련 코드는 변경할 필요가 없다.

이 모듈은 로컬 디스크 조회만 지원한다. OCI에서 직접 읽는 경로는
실제 훈련을 staging/production에서 돌릴 때 별도로 추가한다(이번
범위 아님).
"""

from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from pipeline.src.storage.curated_snapshot_store import CURATED_SNAPSHOT_COLUMNS


def _parse_bound(value, field_name):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise ValueError(f"{field_name} must include a timezone")
        return value
    if isinstance(value, str) and value:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError(f"{field_name} must include a timezone")
        return parsed
    raise ValueError(f"{field_name} must be a timezone-aware datetime or ISO string")


def load_normalized_snapshots(root_dir, prefix="curated", start=None, end=None):
    """기간 내 정규화 스냅샷을 모두 읽어 하나의 정렬된 DataFrame으로 반환한다.

    root_dir 아래 <prefix>/year=*/month=*/day=*/observed_*.parquet 패턴의
    모든 파일을 읽는다. start/end는 timezone-aware datetime 또는 ISO
    문자열이며, observed_at 기준 [start, end) 반열린 구간으로 필터링한다.
    둘 다 생략하면 전체 기간을 읽는다.

    해당 기간에 파일이 없으면 예외 없이 빈 DataFrame을 반환한다.
    """
    start_bound = _parse_bound(start, "start")
    end_bound = _parse_bound(end, "end")

    search_root = Path(root_dir) / prefix
    files = sorted(search_root.glob("year=*/month=*/day=*/observed_*.parquet"))

    if not files:
        return pd.DataFrame(columns=CURATED_SNAPSHOT_COLUMNS)

    frames = [pd.read_parquet(f) for f in files]
    combined = pd.concat(frames, ignore_index=True)

    if not combined.empty:
        observed = pd.to_datetime(combined["observed_at"], utc=True)
        if start_bound is not None:
            combined = combined[observed >= start_bound]
            observed = pd.to_datetime(combined["observed_at"], utc=True)
        if end_bound is not None:
            combined = combined[observed < end_bound]

    combined = combined.sort_values(
        ["station_id", "observed_at"], kind="stable"
    ).reset_index(drop=True)
    return combined

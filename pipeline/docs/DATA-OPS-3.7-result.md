# DATA-OPS-3.7 실행 결과 — 정규화 Parquet 저장·훈련 준비

- 작업 ID: DATA-OPS-3.7
- 담당자: 김선호 (조장, leader-integration-required)
- 범위: 정규화 10분 스냅샷의 Parquet 저장 writer와 훈련용 로더. 실제 훈련 실행·DAG 배선·자동 수집 활성화는 범위 밖.
- 작성일: 2026-08-16

## 1. 형식 결정 배경 (DEC-013)

CHG-092 2절 "정규화·시간당 집계 저장량 NOT_MEASURED" 게이트를 해소하며 형식이 미정이었다. JSON/CSV/Parquet 실측 비교 후 Parquet(snappy)을 채택했다.

## 2. 실측 크기 (정규화 스냅샷 1개, 대여소 2,735개 합성 데이터)

| 형식 | 원문 | gzip |
|---|---:|---:|
| JSON envelope | 818,931 bytes | 40,010 bytes |
| CSV 전체 필드 | 301,964 bytes | 37,678 bytes |
| **Parquet(snappy) 전체 필드** | **61,086 bytes** | 16,159 bytes |
| Parquet(snappy) 3필드 | 19,558 bytes | 5,928 bytes |

Parquet 전체 필드가 JSON 대비 약 **13분의 1**이다. 압축을 추가로 걸지 않아도 gzip한 JSON보다 작다.

### 보관정책 적용 총 저장량

시간당 집계는 DEC-010에 따라 정각 cycle 스냅샷을 그대로 채택하므로 별도 크기가 아니라 정규화 스냅샷과 동일하다.

| 계층 | 스냅샷 수 | Parquet 전체 필드 |
|---|---:|---:|
| 정규화 (7일, 6회/시간) | 1,008 | 0.0152 GiB |
| 시간당 집계 (35일, 24회/일) | 840 | 0.0126 GiB |
| **합계** | | **0.0278 GiB** |

정책 v1.2의 추가 예산 2GiB 대비 **1.4%**. 경고 임계 1GiB 대비로도 3% 미만이다.

## 3. 구현

### Writer — `pipeline/src/storage/curated_snapshot_store.py`

- `build_curated_snapshot_record(curated_rows, observed_at, prefix="curated")`: Raw와 동일한 key 파티션 규칙(`year=/month=/day=`)으로 경로를 만든다.
- `write_curated_snapshot_once_local(...)`: 로컬 저장. 임시 파일에 먼저 쓰고 원자적으로 배치하며, 같은 경로가 이미 있으면 덮어쓰지 않고 `created=False`를 반환한다.
- `write_curated_snapshot_once_oci(...)`: OCI 저장. `oci_raw_store.write_raw_object_once`와 동일하게 `if_none_match="*"`로 멱등성을 보장한다.
- 시간당 집계용 별도 writer는 만들지 않았다. DEC-010에 따라 정각 cycle 호출 시 같은 writer를 재사용한다.

### Loader — `pipeline/src/training_data_loader.py`

- `load_normalized_snapshots(root_dir, prefix="curated", start=None, end=None)`: 기간 내 모든 스냅샷 Parquet 파일을 읽어 `station_id, observed_at` 순으로 정렬된 단일 DataFrame으로 합친다.
- 파일이 없는 기간은 예외 없이 빈 DataFrame을 반환한다.
- `start`/`end`는 `[start, end)` 반열린 구간이며 timezone-aware 값만 허용한다.
- **훈련 코드는 이 함수만 호출한다.** 저장 형식이 Parquet이라는 사실을 몰라도 되며, 나중에 형식을 바꾸면 이 함수 내부만 교체한다.

## 4. 훈련 준비 사용 예시 (실제 실행 아님)

```python
from datetime import datetime, timezone
from pipeline.src.training_data_loader import load_normalized_snapshots

# 4주치가 쌓였다고 가정한 조회 예시. 지금은 데이터가 없으므로 빈 DataFrame이 반환된다.
frame = load_normalized_snapshots(
    root_dir="/opt/airflow/data/curated",
    start=datetime(2026, 8, 1, tzinfo=timezone.utc),
    end=datetime(2026, 8, 29, tzinfo=timezone.utc),
)
# frame.columns == ["station_id", "station_name", "observed_at",
#                    "bike_count", "rack_count", "latitude",
#                    "longitude", "collected_at"]
# 이후 피처 엔지니어링·모델 학습은 이번 작업 범위가 아니다.
```

## 5. 검증

```
python -m pytest pipeline/tests/test_curated_snapshot_store.py pipeline/tests/test_training_data_loader.py -v
9 passed in 1.48s

python -m pytest pipeline/tests -q
100 passed in 17.37s
```

| 테스트 | 증명 내용 |
|---|---|
| `test_build_curated_snapshot_record_uses_raw_style_partitioning` | Raw와 동일한 key 파티션 규칙 |
| `test_write_creates_a_readable_parquet_file` | 실제 round-trip: 쓰고 다시 읽으면 값이 같다 (0대 포함) |
| `test_rerun_with_same_observed_at_does_not_overwrite` | 재실행 시 기존 파일 보존, `created=False`, 실제로 덮어쓰지 않았는지 재확인 |
| `test_missing_timezone_is_rejected` | naive datetime 거부 |
| `test_empty_period_returns_empty_frame_not_exception` | 빈 기간에 예외 없이 빈 DataFrame |
| `test_loader_merges_multiple_snapshots_into_one_frame` | 여러 파일을 하나로 병합 |
| `test_loader_filters_by_half_open_period` | `[start, end)` 반열린 구간 필터 |
| `test_loader_output_is_sorted_by_station_then_time` | station_id, observed_at 순 정렬 |
| `test_naive_bound_is_rejected` | naive 기간 경계 거부 |

## 6. 경계 준수

- OCI writer 함수는 구현했으나 이 작업에서 실행하지 않았다. `oci_used` 활동 없음.
- Airflow DAG에서 이 writer를 호출하도록 배선하지 않았다. `airflow_used` 활동 없음.
- 실제 provider payload로 훈련을 실행하지 않았다. 4절 예시는 실행되지 않은 코드 스니펫이다.
- 자동 수집을 시작하지 않았다. CHG-092의 자동 수집 시작은 계속 NOT_APPROVED.
- OCI 식별자·자격증명·namespace 값을 기록하지 않았다.

## 7. 별도 재검토 필요 사항

정규화 10분 데이터의 보관기간은 정책 v1.2 기준 **7일**이다. "4주치 데이터를 모아 훈련 체계를 검증한다"는 계획과 어긋난다. 현재 정책대로면 10분 정규화 데이터는 7일치만 남고, 4주(28일)를 채우는 건 시간당 집계(35일 보관)뿐이다. 시간당 집계로 훈련하면 그건 10분 모델이 아니라 지금과 같은 1시간 모델이 된다.

이 문서는 이 어긋남을 해결하지 않는다. 별도 조장 결정(정책 개정 또는 계획 조정)이 필요하다.

## 8. 조장 후속 작업

- 정규화 10분 데이터 보관기간과 4주 데이터 축적 계획의 불일치를 검토하고 결정한다.
- Parquet 채택을 CHG-092에 반영해 저장량 게이트를 해소한다.
- AIRFLOW-OPS-3.1 stage-2가 열리면 이 writer를 DAG에 배선하는 별도 작업을 계획한다.

# AIRFLOW-OPS-3.1 실행 결과 — stage-1 수동 DAG

- 작업 ID: AIRFLOW-OPS-3.1
- 담당자: 김선호 (조장, leader-integration-required)
- 범위: stage-1(수동 실행 전용 DAG 골격)만. stage-2 자동 스케줄 활성화는 범위 밖이며 차단 유지.
- starter: `origin/main` @ `a280ff5ac899a257f6ceea81dde29c9ef47cfa2f`
- 브랜치: `codex/airflow-ops-3.1-ten-minute-collection`
- 작성일: 2026-08-16

## 1. 증거 구분

이 문서는 세 종류의 증거를 섞지 않는다.

| 구분 | 상태 | 근거 |
|---|---|---|
| A. fixture·정적 구조 검증 | **PASS** | 아래 2·3절 |
| B. 실제 소스 수동 실행 | **NOT_RUN** | 아래 4절 |
| C. 자동 운영(상시 수집) | **NOT_APPROVED** | 아래 5절 |

B와 C의 증거는 이 문서에 없다. 없는 것을 있는 것처럼 기록하지 않는다.

## 2. 변경 파일

starter `a280ff5` 대비 신규 2파일이며, 기존 파일은 하나도 수정하지 않았다.

```
?? pipeline/dags/bike_weather_ten_minute_collection_dag.py
?? pipeline/tests/test_ten_minute_collection_dag.py
```

이 결과 문서(`pipeline/docs/AIRFLOW-OPS-3.1-result.md`)를 포함해 허용 경로 3개 안에서만 작업했다.
금지 경로(`.env`, `.github/`, `backend/`, `frontend/`, `infra/`, `pipeline/src/storage/`) 변경은 0건이다.

## 3. 검증 결과 (구분 A)

### 3.1 targeted 테스트

```
python -m pytest pipeline/tests/test_ten_minute_collection_dag.py -q
9 passed in 0.04s
```

### 3.2 기존 DAG 구조 테스트와 함께

```
python -m pytest pipeline/tests/test_dag_structure.py pipeline/tests/test_ten_minute_collection_dag.py -q
13 passed in 0.03s
```

### 3.3 pipeline 전체 회귀

```
python -m pytest pipeline/tests -q
100 passed in 16.81s
```

### 3.4 테스트가 실제로 증명하는 것

| 테스트 | 증명 내용 |
|---|---|
| `test_dag_file_is_valid_python` | 새 DAG가 Python으로 파싱된다 |
| `test_dag_id_is_separate_from_the_development_dag` | `dag_id="bike_weather_ten_minute_collection"`이며 기존 개발 DAG 파일에 같은 ID가 없다 |
| `test_automatic_scheduling_is_disabled` | `schedule=None`, `catchup=False`, `max_active_runs=1` |
| `test_task_ids_match_the_approved_boundary` | 태스크 4개가 정확히 승인된 집합과 일치한다 |
| `test_dependency_order_is_collect_then_quality_then_aggregation` | 품질 태스크가 수집 2개를 인자로 받고, 집계 경계 태스크가 품질 결과만 인자로 받는다 (collect → quality → aggregate) |
| `test_collection_failure_uses_the_approved_single_retry` | `retries=1`, `retry_delay=timedelta(seconds=60)` — DATA-OPS-3.5의 "60초 뒤 1회만 재시도" |
| `test_quality_failure_blocks_downstream_tasks` | 품질 실패 시 `AirflowFailException`을 raise하고 품질 태스크 `retries=0` |
| `test_unapproved_hourly_aggregation_is_declared_but_not_computed` | 시간당 집계가 `NOT_APPROVED`로 선언되고 `aggregation_performed: False` |
| `test_no_raw_storage_oci_database_or_model_publishing_is_imported` | storage·oci·psycopg·sqlalchemy·batch_inference·model 계열 import 0건, `write_raw_once`/`write_raw_object_once` 호출 0건, `RAW_STORAGE_MODE` 분기 없음 |

Airflow 패키지를 설치하지 않고 AST·소스텍스트로 검사한다. 이는 기존 `test_dag_structure.py`와 같은 방식이며, 외부 API를 호출하지 않는다.

### 3.5 `schedule=None` 유지 증거

```
git diff --name-only a280ff5ac899a257f6ceea81dde29c9ef47cfa2f -- pipeline/dags/bike_weather_raw_curated_dag.py
(출력 없음 = 기존 DAG 무변경)

grep -n "schedule=None"
pipeline/dags/bike_weather_ten_minute_collection_dag.py:63:    schedule=None,
pipeline/dags/bike_weather_raw_curated_dag.py:90:    schedule=None,
```

새 DAG와 기존 DAG 모두 자동 스케줄이 비활성이다.

### 3.6 공백·secret scan

```
git diff --check          → exit 0
secret 패턴 스캔(신규 2파일) → 0건
```

키는 코드에 없다. `SEOUL_OPEN_API_KEY`, `KMA_SERVICE_KEY`, `KMA_NX`, `KMA_NY`는 모두 `os.getenv`로만 읽으며 기본값은 빈 문자열이다.

## 4. 실제 수동 실행 (구분 B) — NOT_RUN

**상태: NOT_RUN**

사유:

1. 로컬 `.venv`에 `airflow` 패키지가 설치되어 있지 않다 (`ModuleNotFoundError: No module named 'airflow'`). 따라서 실제 DAG import와 태스크 실행을 이 환경에서 수행할 수 없다.
2. 실제 실행 환경인 `infra/airflow` compose는 이번 작업 계약의 금지 경로다.
3. 승인된 staging 환경이 제공되지 않았다.

실행하려면 조장이 Git 밖에서 다음을 준비해야 하며, 값은 코드·로그·증거에 남기지 않는다.

- `.env`의 `SEOUL_OPEN_API_KEY`, `KMA_SERVICE_KEY` 실제 값
- 실행 시 `BIKE_INVENTORY_SOURCE=api`, `WEATHER_SOURCE=api`
- `RAW_STORAGE_MODE`는 변경하지 않는다 (실제 Raw 저장은 stage-2 범위)

실행 후에는 마스킹된 요청 수·성공/실패·응답 시각만 이 절에 추가한다.

## 5. 자동 운영 (구분 C) — NOT_APPROVED

다음이 모두 미충족이므로 자동 수집을 시작하지 않았고, 시작할 수 없다.

- CHG-092의 자동 수집 명시 승인이 `NOT_APPROVED`다.
- 시간당 집계 기준시각·선택 규칙이 DATA-OPS-3.5에서 승인되지 않았다. 그래서 집계 태스크는 규칙을 계산하지 않고 경계만 선언한다.
- 저장 대상, 보관·lifecycle·archive·삭제·비용 경계가 별도 승인되지 않았다. OCI lifecycle·archive·삭제는 수동·자동 모두 금지 상태다.
- staging 수동 실행 증거 묶음(4절)이 아직 없다.

stage-2에서 `schedule=None`을 바꾸거나 scheduler 배포를 만들려면 위 항목의 날짜가 있는 승인이 먼저 기록되어야 한다.

## 6. 설계 메모

- 새 DAG는 Raw payload를 저장하지 않는다. 수집 태스크는 품질 판정에 필요한 통합 응답만 XCom으로 넘긴다.
- 수집 태스크는 `BIKE_INVENTORY_SOURCE` / `WEATHER_SOURCE`가 `api`가 아니면 명시적으로 실패한다. stage-1 DAG는 fixture 게시 경로를 갖지 않기 때문이다.
- `DAILY_REQUEST_ATTEMPT_CAP = 864`는 DATA-OPS-3.5가 넘긴 프로젝트 자체 API 보호 상한이다. 따릉이 제공처의 공식 쿼터가 아니며, 제공처 사용 조건이 확인되면 교체한다. stage-1에서는 집계 경계 태스크가 이 값과 이번 실행의 요청 시도 수를 함께 보고할 뿐 차단 로직을 실행하지 않는다.
- `catchup=False`는 DATA-OPS-3.5의 "중단 시 catch-up 하지 않는다" 규칙과 일치한다.

## 7. 조장 후속 작업

- stage-1 증거를 검토하고 `검토 요청` 판정을 기록한다.
- CHG-092 자동 수집 활성화 항목을 날짜가 있는 별도 승인으로 결정한다.
- 시간당 집계 기준시각·선택 규칙을 승인하거나 계속 보류한다.
- 실제 수동 실행이 필요하면 staging과 자격증명을 준비하고 4절을 갱신한다.

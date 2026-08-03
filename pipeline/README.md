# 예측 자료 처리

서울시 대여소와 자전거 수, 날씨 자료를 모아 정리하고 미래 대여 가능성을 미리 계산하는 영역입니다.

확정된 방식:

`자료 수집 → 원본 보관 → 자료 확인·정리 → 예측 미리 계산 → PostgreSQL 저장`

사용자가 예측 버튼을 누를 때마다 모델을 새로 실행하지 않습니다. 모든 대여소와 시간 구간의 예측을 주기적으로 미리 계산합니다.

배치 주기, 예측 시간 간격, 자료가 오래됐다고 판단할 기준은 데이터 검증 후 설계 문서에서 확정합니다.

## AIRFLOW-2.1 개발 실행

현재 2주차 구조는 기본적으로 작은 fixture 응답을 사용하며, 환경변수로 서울시
실시간 따릉이 API와 기상청 초단기실황 API 수집을 각각 선택할 수 있습니다.
과거 학습용 날씨 자료 계약은 후속 데이터 작업에서 별도로 확정합니다.

```text
collect_bike_inventory ─┐
                        ├─ validate_raw_quality ─┬─ build_curated_inventory
collect_weather ────────┘                        └─ build_curated_weather
```

- 수집 태스크는 최대 2회, 60초 간격으로 재시도합니다.
- 수집 실패는 품질검사와 Curated 태스크로 진행되지 않습니다.
- 품질검사 실패는 재시도하지 않고 두 Curated 태스크를 차단합니다.
- 같은 관측시각과 수집시각을 다시 실행하면 Raw JSON을 추가로 만들지 않습니다.
- 개발 중 Raw 파일은 `D:\ddarung-flow-data\platform\raw\`에 저장합니다.
- 실제 키 값은 저장하지 않습니다. 따릉이·날씨 실제 API와 OCI Object Storage는 선택 실행할 수 있으며 PostgreSQL 게시와 운영 배포는 후속 범위입니다.

### Python 테스트

저장소 루트의 PowerShell에서 실행합니다.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r pipeline\requirements.txt
.\.venv\Scripts\python.exe -m pytest pipeline\tests -q
```

### Airflow 개발환경

Docker Desktop을 실행한 뒤 저장소 루트에서 실행합니다.

### 환경변수 설정

환경변수는 다음 순서로 전달됩니다.

```text
infra/airflow/.env
→ Docker Compose의 ${변수명}
→ Airflow 컨테이너 환경변수
→ DAG의 os.getenv("변수명")
```

fixture 검증만 할 때는 Compose 기본값이 있으므로 `.env`가 없어도 됩니다. 실제 API 연결을 준비할 때만 다음 명령으로 개인용 파일을 만듭니다.

```powershell
Copy-Item infra\airflow\.env.example infra\airflow\.env
notepad infra\airflow\.env
```

`.env`에서 다음 두 줄의 오른쪽에 발급받은 값을 입력합니다.

```dotenv
SEOUL_OPEN_API_KEY=발급받은_서울시_API_키
KMA_SERVICE_KEY=발급받은_기상청_서비스_키
```

`infra/airflow/.env`는 Git 제외 대상입니다. `.env.example`에는 실제 키를 넣지 않습니다.
`BIKE_INVENTORY_SOURCE=fixture`가 기본값이고, 실제 호출 검증 시에만 `api`로 바꿉니다.

| 변수 | 현재 역할 |
|---|---|
| `AIRFLOW_UID` | 컨테이너가 파일을 만들 때 사용할 사용자 ID |
| `DDARUNG_AIRFLOW_IMAGE` | 로컬에서 빌드할 Airflow 이미지 이름 |
| `DDARUNG_DATA_ROOT` | 호스트의 Raw 데이터 저장 루트 |
| `BIKE_INVENTORY_FIXTURE` | 따릉이 성공·실패 테스트 JSON 파일명 |
| `WEATHER_FIXTURE` | 날씨 테스트 JSON 파일명 |
| `WEATHER_SOURCE` | `fixture` 또는 `api`; 기본값은 `fixture` |
| `SEOUL_OPEN_API_KEY` | 서울시 실시간 따릉이 API 연결용 비밀값 |
| `BIKE_INVENTORY_SOURCE` | `fixture` 또는 `api`; 기본값은 `fixture` |
| `KMA_SERVICE_KEY` | 기상청 초단기실황 API 연결용 비밀값 |
| `KMA_NX`, `KMA_NY` | 기상청 격자 좌표 |

개인용 `.env`를 사용하는 명령에는 다음처럼 파일 위치를 명시합니다.

```powershell
docker compose --env-file infra\airflow\.env -f infra\airflow\docker-compose.yaml config
```

기본 fixture 검증은 아래 명령으로 실행합니다.

```powershell
docker compose -f infra\airflow\docker-compose.yaml config
docker compose -f infra\airflow\docker-compose.yaml build airflow-worker
docker compose -f infra\airflow\docker-compose.yaml up airflow-init
docker compose -f infra\airflow\docker-compose.yaml up -d airflow-dag-processor airflow-scheduler
docker compose -f infra\airflow\docker-compose.yaml run --rm airflow-worker airflow dags list
docker compose -f infra\airflow\docker-compose.yaml run --rm airflow-worker airflow dags list-import-errors
docker compose -f infra\airflow\docker-compose.yaml run --rm airflow-worker airflow dags test bike_weather_raw_curated 2026-08-05
docker compose -f infra\airflow\docker-compose.yaml down
```

루트 `.env`의 서울시 키로 실제 따릉이 API만 검증할 때는 날씨 fixture를 유지하고
다음처럼 실행합니다.

```powershell
docker compose --env-file .env -f infra\airflow\docker-compose.yaml run --rm -e BIKE_INVENTORY_SOURCE=api -e RAW_STORAGE_MODE=local airflow-worker airflow dags test bike_weather_raw_curated 2026-08-07
```

기상청 초단기실황까지 실제 API로 검증할 때는 `WEATHER_SOURCE=api`를 함께
지정합니다. 초단기실황은 매시 40분 이후 가장 최근 발표시각을 자동으로 선택합니다.

```powershell
$logicalDate = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
docker compose --env-file .env -f infra\airflow\docker-compose.yaml run --rm `
  -e BIKE_INVENTORY_SOURCE=api -e WEATHER_SOURCE=api -e RAW_STORAGE_MODE=local `
  airflow-worker airflow dags test bike_weather_raw_curated $logicalDate
```

로컬에서 OCI Object Storage까지 함께 저장할 때는 개인키 마운트가 있는 로컬
오버레이와 `RAW_STORAGE_MODE=both`를 사용합니다.

```powershell
docker compose --env-file .env `
  -f infra\airflow\docker-compose.yaml `
  -f infra\airflow\docker-compose.local.yaml `
  run --rm -e BIKE_INVENTORY_SOURCE=api -e WEATHER_SOURCE=api -e RAW_STORAGE_MODE=both `
  airflow-worker airflow dags test bike_weather_raw_curated 2026-08-08
```

OCI Compute에서는 개인키를 마운트하지 않고 `oci.env.example`을 복사한 서버용
환경파일과 Instance Principal을 사용합니다.

```bash
cp infra/airflow/oci.env.example infra/airflow/oci.env
docker compose --env-file infra/airflow/oci.env \
  -f infra/airflow/docker-compose.yaml up -d
```

빈 재고 fixture로 품질 실패와 Curated 차단을 확인할 때만 다음 명령을 사용합니다.

```powershell
docker compose -f infra\airflow\docker-compose.yaml run --rm -e BIKE_INVENTORY_FIXTURE=bike_inventory_empty.json airflow-worker airflow dags test bike_weather_raw_curated 2026-08-06
```

이 명령은 `Raw quality failed; Curated tasks are blocked` 오류와 실패 종료코드를 반환해야 정상입니다.

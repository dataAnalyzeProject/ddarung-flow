# OCI non-production Airflow runbook

AIRFLOW-OPS-3.2는 승인된 `main`의 Airflow(postgres, scheduler, dag-processor, api-server)를 기존 OCI 비운영 `crawling_server`(이미 `infra/staging`이 쓰는 그 서버)에서 **별도의 세 번째 Compose 프로젝트**로 기동합니다. 새 Compute는 만들지 않습니다. 이 문서는 인프라 기동만 다루며, DAG의 `schedule=None`을 실제 주기로 바꾸는 것은 `CHG-092` 승인 이후 별도 코드 변경으로만 합니다 — 이 runbook의 어떤 단계도 자동 수집을 켜지 않습니다.

## 고정 안전선

- 담당자: 김선호
- 비용: OCI Console에서 `Always Free-eligible` 또는 예상 청구액 0원 확인 후에만 진행
- 노출: Airflow UI/API(`8080`)는 서버 loopback(`127.0.0.1`)에만 bind. 신규 public ingress·nginx route·NSG 규칙 없음. 접속은 SSH 터널로만.
- secret: `AIRFLOW_JWT_SECRET`, `SEOUL_OPEN_API_KEY`, `KMA_SERVICE_KEY`는 서버의 비추적 `infra/airflow/.env`에만 존재. Git·Notion·PR·스크립트 인자·채팅에 넣지 않음.
- schedule: 배포 전후 모두 DAG는 `schedule=None`(수동 실행 전용)을 유지. 이 값을 바꾸는 건 `CHG-092` 승인 뒤 별도 PR로만 한다.
- 중단: Free Tier 용량 부족, 유료 표시, secret 노출 위험, 승인 경로 밖 변경, health 실패, `schedule=None` 외 값으로 바뀐 흔적 발견

## 왜 build-push-pull이 아니라 git clone인가

`infra/staging`의 frontend/backend는 OCIR에 이미지를 push하고 서버가 pull합니다. Airflow의 DAG/pipeline 코드는 이미지가 아니라 `docker-compose.yaml`의 volume mount(`../../pipeline:/opt/airflow/pipeline`)로 컨테이너에 들어가는 소스입니다 — 이미지 자체에는 의존성만 baked 상태이므로, 서버에 승인 커밋을 그대로 `git clone`/`git checkout`하고 `docker compose build`로 로컬 빌드하는 편이 registry 태그·digest 관리보다 단순하고, 기존 로컬 개발 compose와 동일한 구조를 유지합니다.

## 체크포인트 A — 기존 서비스 공존 확인

1. 새 Compute를 생성하거나 기존 shape을 변경하지 않습니다.
2. 기존 `crawling_server`(2 CPU, 11 GiB RAM) 위 `app`(staging)과 원래 크롤링 컨테이너가 모두 healthy인지 확인합니다.
3. 기존 loopback port 3000/5000/8080(크롤링), 3100/8180/5432(staging)와 겹치지 않는지 확인합니다. Airflow는 `8080`을 쓰는데, staging 컨테이너 내부 포트 8080과는 다른 Compose 네트워크·다른 host bind이므로 충돌하지 않지만, 배포 직전 `sudo ss -tlnp | grep 8080`으로 host에서 실제 비어 있는지 한 번 확인합니다.
4. 배포 직전 root disk 가용 공간이 8 GiB 미만이면 중단합니다.

## 체크포인트 B — 서버 준비

```bash
docker version
docker compose version
git --version
df -h /
sudo ss -tlnp | grep 8080 || echo "8080 free"
```

```bash
mkdir -p /home/ubuntu/ddarung-flow-airflow-data/platform/raw
chmod 700 /home/ubuntu/ddarung-flow-airflow-data
```

`/home/ubuntu/ddarung-flow-airflow/infra/airflow/.env`는 최초 `git clone` 이후 서버에서 직접 만들고 `chmod 600`을 적용합니다(레포의 `.env.example`을 기준으로 채웁니다). `AIRFLOW_JWT_SECRET`은 이 배포 전용으로 새로 생성합니다.

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

`.env`의 `OCI_AUTH_MODE`는 `instance_principal`로 설정합니다 — 이 VM 자체의 IAM 정책으로 인증하므로 `OCI_CONFIG_*` 값이나 정적 키가 서버에 전혀 필요 없습니다(같은 VM의 backend/inference가 staging에서 이미 쓰는 방식과 동일, `infra/inference/app.py` 참고). `AIRFLOW_UID`도 서버에서 `id -u`로 확인한 실제 값(보통 `1000`)으로 바꿉니다.

이 값과 `SEOUL_OPEN_API_KEY`, `KMA_SERVICE_KEY`, `OCI_BUCKET_NAME`은 채팅이나 캡처에 남기지 않습니다.

## 체크포인트 C — 로컬 배포 설정

```powershell
Copy-Item infra/airflow/oci.env.example infra/airflow/.env.oci
```

다음 항목만 실제 환경에 맞게 채웁니다.

- `AIRFLOW_HOST`: staging과 동일한 public IP 또는 승인 host
- `AIRFLOW_SSH_USER`: `ubuntu`
- `AIRFLOW_SSH_KEY_PATH`: 로컬 private key 경로(key 내용은 넣지 않음)
- `REMOTE_AIRFLOW_DIR`: `/home/ubuntu/ddarung-flow-airflow`
- `DDARUNG_DATA_ROOT`: `/home/ubuntu/ddarung-flow-airflow-data`
- `AIRFLOW_ZERO_COST_CONFIRMED`: Console에서 0원 확인 후에만 `YES`

## 최초 기동

```powershell
git status --short
git rev-parse HEAD
./infra/airflow/deploy-airflow.ps1 -ApprovedCommit <40자리 승인 main SHA>
```

스크립트가 수행하는 범위:

1. 0원 확인값, SSH key, 설정 형식 검사
2. 서버에 승인 커밋을 `git clone`(최초 1회) 또는 `git fetch` + `checkout --detach`
3. 데이터 디렉터리 생성
4. 서버의 기존 `.env` 존재·권한 확인, `docker compose config` 검증
5. `docker compose build` (로컬 빌드, registry 없음)
6. `airflow-init` 1회 실행(DB migrate) 후 `postgres`, `airflow-scheduler`, `airflow-dag-processor`, `airflow-api-server` 기동
7. server-local `http://127.0.0.1:8080/api/v2/monitor/health` smoke

## 배포 뒤 확인

```bash
cd /home/ubuntu/ddarung-flow-airflow/infra/airflow
docker compose --env-file .env -f docker-compose.yaml -f docker-compose.oci.yaml ps
docker compose --env-file .env -f docker-compose.yaml -f docker-compose.oci.yaml logs --no-color --tail 100 airflow-scheduler airflow-api-server
grep -r "schedule=" ../../pipeline/dags/bike_weather_ten_minute_collection_dag.py
```

마지막 명령 결과가 `schedule=None`이 아니면 즉시 중단하고 조장에게 보고합니다 — 이 배포는 인프라 기동만이며 DAG 스케줄 변경을 포함하지 않습니다.

UI 접속(선택, 확인 용도):

```bash
ssh -i <key> -L 8080:127.0.0.1:8080 <user>@<host>
# 로컬 브라우저에서 http://127.0.0.1:8080
```

## 성공 조건

- api-server health 200
- 세 컨테이너(scheduler, dag-processor, api-server) 모두 `Up`, postgres `healthy`
- DAG `schedule=None` 유지 확인
- 신규 public ingress·NSG 규칙 없음, 기존 crawling_server·staging 컨테이너 상태 불변

## 롤백

```bash
cd /home/ubuntu/ddarung-flow-airflow/infra/airflow
docker compose --env-file .env -f docker-compose.yaml -f docker-compose.oci.yaml down
```

`down`은 이 Compose 프로젝트의 컨테이너만 내리며 기존 crawling_server·staging 프로젝트에는 영향이 없습니다. 데이터 디렉터리와 `.env`는 그대로 남기고, 문제 원인을 기록한 뒤 재시도합니다.

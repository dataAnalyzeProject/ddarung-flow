# OCI non-production Airflow runbook

AIRFLOW-OPS-3.2는 승인된 `main`의 Airflow(postgres, scheduler, dag-processor, api-server)를 기존 OCI 비운영 `crawling_server`(이미 `infra/staging`이 쓰는 그 서버)에서 **별도의 세 번째 Compose 프로젝트**로 기동합니다. 새 Compute는 만들지 않습니다. 배포는 `infra/staging`의 `Staging CD`와 같은 구조의 GitHub Actions 워크플로우(`.github/workflows/airflow-deploy.yml`)로 합니다. 이 문서는 인프라 기동만 다루며, DAG의 `schedule=None`을 실제 주기로 바꾸는 것은 `CHG-092` 승인 이후 별도 코드 변경으로만 합니다 — 워크플로우와 이 runbook의 어떤 단계도 자동 수집을 켜지 않습니다.

## 고정 안전선

- 담당자: 김선호
- 비용: OCI Console에서 `Always Free-eligible` 또는 예상 청구액 0원 확인 후에만 진행
- 노출: Airflow UI/API(host `8280` → 컨테이너 내부 `8080`)는 서버 loopback(`127.0.0.1`)에만 bind. 신규 public ingress·nginx route·NSG 규칙 없음. 접속은 SSH 터널로만. host `8080`은 기존 `crawling-backend`가 이미 쓰고 있어 재사용하지 않는다(2026-08-21 `docker ps`로 실측 확인).
- secret: `AIRFLOW_JWT_SECRET`, `SEOUL_OPEN_API_KEY`, `KMA_SERVICE_KEY`, SSH 키는 GitHub `oci-airflow` **Environment**의 Secrets에만 존재. Git·Notion·PR·채팅에 넣지 않음. `staging`(`oci-staging`)과 별도 Environment로 분리한다 — 나중에 승인 게이트를 Airflow 쪽에만 걸 수 있게 하기 위함.
- 트리거: `workflow_dispatch` 수동만. `staging`처럼 main 머지마다 자동 재배포하지 않는다 — CHG-092 미승인 단계에서 불필요한 재배포를 만들지 않기 위함.
- schedule: 배포 전후 모두 DAG는 `schedule=None`(수동 실행 전용)을 유지. 워크플로우가 배포 직전·직후 모두 `grep`으로 강제 확인하고, 바뀐 게 감지되면 배포를 실패시킨다. 이 값을 바꾸는 건 `CHG-092` 승인 뒤 별도 PR로만 한다.
- 중단: Free Tier 용량 부족, 유료 표시, secret 노출 위험, 승인 경로 밖 변경, health 실패, `schedule=None` 외 값으로 바뀐 흔적 발견

## 체크포인트 A — 기존 서비스 공존 확인

1. 새 Compute를 생성하거나 기존 shape을 변경하지 않습니다.
2. 기존 `crawling_server`(2 CPU, 11 GiB RAM) 위 `app`(staging)과 원래 크롤링 컨테이너가 모두 healthy인지 확인합니다.
3. Airflow는 host의 `8280`을 씁니다(`8080`은 기존 `crawling-backend`가 사용 중이라 재사용하지 않음). 배포 직전 `sudo ss -tlnp | grep 8280`으로 비어 있는지 확인합니다.
4. 배포 직전 root disk 가용 공간이 8 GiB 미만이면 중단합니다. (2026-08-21 실측: 45G 중 9.1G 가용, 80% 사용 — 여유가 크지 않으니 배포 직전 반드시 재확인)

## 체크포인트 B — 서버 준비 (최초 1회, 수동)

```bash
docker version
docker compose version
git --version
df -h /
sudo ss -tlnp | grep 8280 || echo "8280 free"
mkdir -p /home/ubuntu/ddarung-flow-airflow-data/platform/raw
chmod 700 /home/ubuntu/ddarung-flow-airflow-data
```

`/home/ubuntu/ddarung-flow-airflow`는 워크플로우가 최초 배포 때 자동으로 `git clone`합니다. 그 안의 `infra/airflow/.env`는 **최초 1회만 서버에서 직접** 만들고 `chmod 600`을 적용합니다(이후 배포는 이 파일을 건드리지 않습니다 — 시크릿이 아닌 서버 고정 설정만 담습니다).

```dotenv
AIRFLOW_UID=1001
OCI_CONFIG_PROFILE=DDARUNG_AIRFLOW
KMA_NX=60
KMA_NY=127
```

`AIRFLOW_UID`는 서버에서 `id -u`로 확인한 실제 값을 씁니다(2026-08-21 실측: `ubuntu` 계정 UID는 `1001`, 흔한 기본값 `1000`이 아니었음 — 서버마다 다를 수 있으니 매번 직접 확인). `OCI_AUTH_MODE`, `OCI_BUCKET_NAME`, `RAW_STORAGE_MODE`, `BIKE_INVENTORY_SOURCE`, `WEATHER_SOURCE`, `AIRFLOW_JWT_SECRET`, `SEOUL_OPEN_API_KEY`, `KMA_SERVICE_KEY`는 **매 배포 때 워크플로우가 `release.env`/`secrets.env`로 전달**하므로 이 `.env`에는 넣지 않습니다.

## 체크포인트 C — GitHub Environment 설정 (최초 1회)

리포지토리 Settings → Environments에서 `oci-airflow`를 새로 만들고 다음을 채웁니다(`oci-staging`과 값 일부가 겹치더라도 각 Environment에 따로 등록해야 합니다).

**Variables**

- `OCI_REGISTRY`, `OCI_NAMESPACE`, `OCI_REPOSITORY`: staging과 같은 registry/namespace 사용 가능(`ddarung-flow-staging` repository 아래 `airflow` 태그로 push됨)
- `REMOTE_AIRFLOW_DIR`: `/home/ubuntu/ddarung-flow-airflow`
- `DDARUNG_DATA_ROOT`: `/home/ubuntu/ddarung-flow-airflow-data`
- `OCI_BUCKET_NAME`: 실제 사용할 OCI Object Storage bucket 이름

**Secrets**

- `OCIR_USERNAME`, `OCIR_AUTH_TOKEN`: staging과 동일한 값 재사용 가능
- `AIRFLOW_SSH_HOST`, `AIRFLOW_SSH_USER`, `AIRFLOW_SSH_PRIVATE_KEY`, `AIRFLOW_SSH_KNOWN_HOSTS`: staging의 `STAGING_SSH_*`와 같은 서버이므로 같은 값을 이 이름으로 다시 등록
- `AIRFLOW_JWT_SECRET`: 이 배포 전용으로 새로 생성 — `python3 -c "import secrets; print(secrets.token_hex(32))"`
- `SEOUL_OPEN_API_KEY`, `KMA_SERVICE_KEY`: 조장이 발급받은 실제 값

이 값들은 채팅이나 캡처에 남기지 않습니다.

## 배포 실행

GitHub 저장소 → Actions → `Airflow OCI CD` → `Run workflow`에서 다음을 입력합니다.

- `confirmation`: `DEPLOY_AIRFLOW`
- `commit_sha`: 승인된 `main`의 40자리 SHA

워크플로우가 수행하는 범위:

1. 커밋이 `main`의 조상인지 검증
2. DAG가 `schedule=None`인지 배포 전 확인(아니면 즉시 중단)
3. Airflow 이미지를 `linux/arm64`로 build해 OCIR에 push
4. 서버에 승인 커밋을 `git clone`(최초 1회) 또는 `git fetch`+`checkout --detach` — DAG/pipeline 코드는 이미지가 아니라 volume mount이므로 소스 자체가 서버에 있어야 합니다
5. 서버의 기존 `.env` 존재·권한 확인, 새 `release.env`/`secrets.env` 전달(비밀값이 아닌 서버 `.env`는 최초 1회 설정 그대로 유지)
6. `docker compose config` 검증 → `pull` → `airflow-init` 1회 실행(DB migrate) → `postgres`/`scheduler`/`dag-processor`/`api-server` 기동
7. server-local `http://127.0.0.1:8280/api/v2/monitor/health` 확인
8. 배포 뒤 DAG가 여전히 `schedule=None`인지 재확인 — 아니면 즉시 실패 처리
9. 6~8 중 하나라도 실패하면 직전 release로 **자동 롤백**

> **알려진 문제(2026-08-22 실제 발생·수정됨)**: SSH heredoc으로 여러 명령을 한 번에 보내는 스크립트 중간에 `docker compose run`(`-T` 없이)이 있으면, 그 명령이 남은 heredoc의 stdin을 통째로 소비해버려 **그 뒤 명령이 하나도 실행되지 않고도 스크립트가 조용히 성공 종료**됩니다. 실제로 이 배포에서 `airflow-init` 실행 뒤 `up -d`·health check·schedule 재확인이 전부 건너뛰어졌는데 워크플로우는 SUCCESS로 표시됐습니다. 지금은 `run --rm -T airflow-init < /dev/null`로 고쳐져 있습니다 — 이 파일 안에 `docker compose ... run`이 새로 추가될 일이 있으면 항상 `-T`와 `< /dev/null`을 같이 씁니다.

## 배포 뒤 확인 (선택)

```bash
ssh -i <key> -L 8280:127.0.0.1:8280 <user>@<host>
# 로컬 브라우저에서 http://127.0.0.1:8280
```

```bash
cd /home/ubuntu/ddarung-flow-airflow/infra/airflow
docker compose --env-file .env --env-file secrets.env --env-file release.env -f docker-compose.yaml -f docker-compose.oci.yaml ps
docker compose --env-file .env --env-file secrets.env --env-file release.env -f docker-compose.yaml -f docker-compose.oci.yaml logs --no-color --tail 100 airflow-scheduler airflow-api-server
```

## 성공 조건

- api-server health 200
- 세 컨테이너(scheduler, dag-processor, api-server) 모두 `Up`, postgres `healthy`
- DAG `schedule=None` 유지 확인(배포 전·후 워크플로우가 둘 다 검증)
- 신규 public ingress·NSG 규칙 없음, 기존 crawling_server·staging 컨테이너 상태 불변

## 롤백

워크플로우 안에서 health 실패 시 자동으로 직전 release로 되돌립니다. 수동으로 완전히 내려야 하면:

```bash
cd /home/ubuntu/ddarung-flow-airflow/infra/airflow
docker compose --env-file .env --env-file secrets.env --env-file release.env -f docker-compose.yaml -f docker-compose.oci.yaml down
```

`down`은 이 Compose 프로젝트의 컨테이너만 내리며 기존 crawling_server·staging 프로젝트에는 영향이 없습니다.

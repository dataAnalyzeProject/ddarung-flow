# OCI non-production staging runbook

OPS-3.4는 승인된 `main`의 frontend, backend, PostgreSQL을 기존 OCI 비운영 `crawling_server`에서 별도 Compose 프로젝트로 실행하고 최초 기동, 버전 갱신, 직전 image rollback을 검증합니다. AUTH-OPS-3.1은 이 비운영 staging의 실제 OAuth 전달과 HTTPS callback 검증만 추가합니다. 기존 크롤링 서비스 변경, 운영 승인, 운영 데이터, 모델 runtime과 OPS-5.1 Go/No-Go는 승인하지 않습니다.

## 고정 안전선

- 담당자: 김선호
- 비용: OCI Console에서 `Always Free-eligible` 또는 예상 청구액 0원으로 확인된 리소스만 사용
- lifecycle: `CONTINUOUS_STAGING`; 따릉이 route와 staging을 시간 제한 없이 유지하며 공유 Compute는 중지하지 않음
- image: 승인 Git SHA tag와 OCIR immutable digest를 모두 기록하며 `latest` 단독 사용 금지
- secret: Git·Notion·PR·스크립트 인자에 넣지 않고 GitHub `oci-staging` Environment Secrets와 서버의 비추적 `.env`만 사용
- 중단: Free Tier 용량 부족, 유료 표시, secret 노출 위험, 승인 경로 밖 변경, health 또는 rollback 실패

기존 `crawling_server`는 `aarch64`, 2 CPU, 11 GiB RAM이며 사전 점검 당시 가용 메모리 약 10 GiB와 root disk 약 17 GiB를 확인했습니다. 새 Compute 생성이나 shape 변경은 하지 않습니다.

- OCI Free Tier: https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm
- Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- OCIR 준비: https://docs.oracle.com/en-us/iaas/Content/Registry/Concepts/registryprerequisites.htm
- OCIR 로그인: https://docs.oracle.com/en-us/iaas/Content/Functions/Tasks/functionslogintoocir.htm

## 실행 구조

```text
browser
  -> https://shdomain.kro.kr
  -> host nginx
  -> 127.0.0.1:3100 -> frontend nginx
  -> 127.0.0.1:8180 -> backend:8080
  -> postgres:5432
```

- 기존 `https://shdomain.kro.kr/` 인증서와 TCP 80/443을 유지하고 host nginx proxy target을 따릉이로 유지합니다.
- frontend host port 3100과 backend host port 8180은 모두 `127.0.0.1`에만 bind합니다.
- 신규 OCI ingress는 만들지 않으며 3100과 8180을 공개하지 않습니다.
- PostgreSQL 5432는 Compose 내부 network와 OCI host loopback `127.0.0.1:5432`에만 존재하며 외부 인터페이스와 OCI ingress에는 공개하지 않습니다. 로컬 DB 도구는 SSH 터널을 통해서만 접속합니다.
- 새 domain·인증서·DNS는 추가하지 않으며 영구적인 domain 소유권과 사용자 공개는 OPS-5.1 범위입니다.

## 체크포인트 A — 기존 crawling_server 공존 확인

1. 새 Compute를 생성하거나 기존 shape를 변경하지 않습니다.
2. architecture는 확인된 `aarch64`이므로 `TARGET_PLATFORM=linux/arm64`를 사용합니다.
3. 기존 Compose 프로젝트 `app`의 컨테이너 3개가 모두 healthy인지 확인합니다.
4. 기존 loopback port 3000, 5000, 8080과 public port 80, 443을 재사용하지 않습니다.
5. 기존 TCP 80/443 이외의 NSG 또는 Security List 규칙을 추가하지 않습니다.
6. TCP 3100, 8180과 5432 규칙은 만들지 않습니다.
7. Console에서 기존 서버가 승인된 zero-cost 범위인지 확인합니다.

완료 후 채팅에는 전체 IP, OCID, fingerprint 또는 key를 붙이지 말고 아래 정보만 알려줍니다.

- 기존 shape와 architecture: A1 계열 / `aarch64`
- OS: Ubuntu와 버전
- 예상 비용: 0원 확인 여부
- 기존 TCP 22/80/443 규칙 유지와 신규 ingress 없음
- 인스턴스 상태: RUNNING

## 체크포인트 B — 서버와 OCIR 준비

서버에는 Docker Engine, Docker Compose v2, Git이 필요합니다. 설치는 해당 OS의 공식 Docker 절차를 사용하고 다음 명령이 성공하는지만 기록합니다.

```bash
docker version
docker compose version
git --version
curl --version
df -h /
docker compose -p app -f /home/ubuntu/app/docker-compose.yml ps
```

배포 직전 root disk 가용 공간이 8 GiB 미만이거나 기존 크롤링 컨테이너 중 하나라도 healthy가 아니면 중단합니다. OPS-3.4에서는 기존 image를 지우거나 `docker system prune`으로 공간을 만들지 않습니다.

다음 경로를 만들고 소유자를 현재 SSH 사용자로 제한합니다.

```bash
mkdir -p /home/ubuntu/ddarung-flow-staging
chmod 700 /home/ubuntu/ddarung-flow-staging
```

`/home/ubuntu/ddarung-flow-staging/.env`는 서버에서 직접 만들고 `chmod 600`을 적용합니다. 실제 DB password는 이 파일에만 입력하며 채팅이나 화면 캡처에 표시하지 않습니다.

```dotenv
COMPOSE_PROJECT_NAME=ddarung-flow-staging
FRONTEND_BIND_ADDRESS=127.0.0.1
FRONTEND_PORT=3100
BACKEND_BIND_ADDRESS=127.0.0.1
BACKEND_PORT=8180
REACT_APP_API_BASE_URL=https://shdomain.kro.kr
SPRING_PROFILES_ACTIVE=oci
DB_NAME=ddarung_flow
DB_USERNAME=ddarung
DB_PASSWORD=<server-only-random-value>
```

AUTH-OPS-3.1부터 실제 OAuth 값은 GitHub `oci-staging` Environment에서만 관리합니다. Client ID는 Environment Variables, Client Secret은 Environment Secrets에 저장하며 환경은 `main` branch만 배포할 수 있어야 합니다. CD는 값을 출력하지 않고 서버의 `oauth.env`로 전달하며 파일 권한을 `600`으로 고정합니다. 로컬 Compose는 변수가 없을 때 `local-disabled` 자리표시자를 유지합니다.

로컬 PC와 OCI 서버 양쪽에서 OCIR에 대화형으로 로그인합니다.

```text
docker login <region-key>.ocir.io
Username: <tenancy-namespace>/<domain-name>/<username>
Password: OCI auth token을 프롬프트에만 입력
```

토큰을 명령 인자, `.env.oci`, PowerShell history 또는 문서에 넣지 않습니다. 서버의 Docker credential 저장 경고가 나오면 내용을 기록하되 credential 파일을 캡처하지 않습니다.

## 체크포인트 C — 로컬 배포 설정

`infra/staging/oci.env.example`을 `infra/staging/.env.oci`로 복사합니다. `.env.oci`는 Git에서 제외되며 auth token과 DB password를 넣지 않습니다.

```powershell
Copy-Item infra/staging/oci.env.example infra/staging/.env.oci
```

다음 항목만 실제 환경에 맞게 채웁니다.

- `OCI_REGISTRY`: 기존 서버가 사용하는 Tokyo endpoint `ap-tokyo-1.ocir.io`
- `OCI_NAMESPACE`: Object Storage namespace
- `OCI_REPOSITORY`: 비운영 repository 경로
- `TARGET_PLATFORM`: A1은 `linux/arm64`, E2.1.Micro는 `linux/amd64`
- `STAGING_HOST`: public IP 또는 승인 host
- `STAGING_SSH_USER`: Ubuntu image의 SSH 사용자
- `STAGING_SSH_KEY_PATH`: 로컬 private key 파일 경로; key 내용은 넣지 않음
- `STAGING_FRONTEND_PORT`: server-local frontend port `3100`
- `STAGING_PUBLIC_URL`: `https://shdomain.kro.kr`
- `OCI_ZERO_COST_CONFIRMED`: Console에서 0원 확인 후에만 `YES`
- `STAGING_LIFECYCLE_MODE`: 지속형 staging 고정값 `CONTINUOUS_STAGING`

첫 배포 전에 SSH host key를 사용자가 직접 확인하고 한 번 접속합니다. 스크립트는 host key 확인을 우회하지 않습니다.

```powershell
ssh -i <key-path> <user>@<public-ip>
```

## 최초 기동

Docker Buildx가 선택 platform image를 OCIR에 직접 push합니다. 현재 HEAD가 사용자가 승인한 40자리 commit과 일치해야 합니다.

```powershell
docker buildx version
git status --short
git rev-parse HEAD
./infra/staging/deploy-staging.ps1 -ApprovedCommit <40자리 승인 main SHA>
```

스크립트가 수행하는 범위:

1. 0원 확인값, SSH key와 설정 형식 검사
2. frontend/backend를 선택 architecture로 build하고 SHA tag로 OCIR push
3. registry digest 확인
4. 서버에 `docker-compose.yaml`과 비밀이 없는 `release.env` 전송
5. 서버의 기존 `.env`, GitHub CD가 전달한 `oauth.env` 존재와 권한 확인
6. pull, `up -d --no-build`, Compose 상태와 PostgreSQL health 확인
7. server-local frontend와 `/api/` proxy smoke; 이 시점에는 아직 public domain 전환 완료로 판정하지 않음

## 최초 bootstrap 추가 확인과 증거

서버에서 실제 값을 출력하지 않는 범위만 실행합니다.

```bash
cd /home/ubuntu/ddarung-flow-staging
docker compose --env-file .env --env-file oauth.env --env-file release.env -f docker-compose.yaml ps
docker compose --env-file .env --env-file oauth.env --env-file release.env -f docker-compose.yaml logs --no-color --tail 100 frontend backend postgres
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8180/api/v1/auth/me
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/v1/auth/me
docker compose -p app -f /home/ubuntu/app/docker-compose.yml ps
```

위 검사가 통과한 뒤에만 현재 nginx 파일을 한 번 백업하고 proxy target을 전환합니다. backup 파일이 이미 있으면 덮어쓰지 말고 중단합니다.

```bash
sudo test ! -e /etc/nginx/sites-available/crawling-project.pre-ddarung
sudo cp -a /etc/nginx/sites-available/crawling-project /etc/nginx/sites-available/crawling-project.pre-ddarung
sudo sed -i \
  -e 's#http://127.0.0.1:3000#http://127.0.0.1:3100#g' \
  -e 's#http://127.0.0.1:8080#http://127.0.0.1:8180#g' \
  /etc/nginx/sites-available/crawling-project
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t`가 실패하면 reload하지 말고 즉시 원본을 복원합니다.

```bash
sudo cp -a /etc/nginx/sites-available/crawling-project.pre-ddarung /etc/nginx/sites-available/crawling-project
sudo nginx -t
```

전환 뒤 public domain에서 따릉이를 확인합니다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://shdomain.kro.kr/
curl -s -o /dev/null -w '%{http_code}\n' https://shdomain.kro.kr/api/v1/auth/me
docker compose -p app -f /home/ubuntu/app/docker-compose.yml ps
```

성공 조건:

- frontend HTTP 200
- backend 직접 응답과 frontend `/api/` proxy가 200, 401 또는 403
- postgres healthy, 세 서비스 반복 재시작 없음
- backend 로그에 DB 연결과 애플리케이션 시작이 있고 반복 ERROR 없음
- 로그에 실제 password, token, private key, 전체 OCID 없음

## 성공한 main CI 기반 자동 갱신

새 `main`의 CI가 성공하면 `.github/workflows/staging-deploy.yml`이 동일 commit을 linux/arm64 image로 build·push하고 OCI를 자동 갱신합니다. 이전 SHA tag와 digest를 덮어쓰지 않으며, 동시 배포는 concurrency 1로 직렬화합니다. `deploy-staging.ps1`은 최초 bootstrap과 장애 복구에서만 사용합니다.

기록할 값:

- 이전 승인 SHA/tag/digest
- 새 승인 SHA/tag/digest
- 갱신 전후 frontend/backend/DB smoke
- 갱신 중 반복 재시작 또는 오류

## 직전 image rollback

직전 정상 SHA tag를 사용자가 명시합니다. 스크립트는 DB schema나 volume을 되돌리거나 삭제하지 않습니다.

```powershell
./infra/staging/rollback-staging.ps1 -PreviousTag <직전-정상-SHA-tag>
```

rollback 후 최초 기동과 같은 smoke를 반복합니다. tag가 없거나 pull/smoke가 실패하면 임의 tag를 추측하지 않고 중단합니다.

## 지속 운영과 비상 중지

23시를 포함한 시간 기준 전환·중지는 없습니다. `https://shdomain.kro.kr`과 따릉이 staging은 계속 유지하고 성공한 main CI만 자동 배포합니다. 다음 명령은 장애 대응으로 조장이 따릉이 staging 중지를 명시했을 때만 사용합니다. `down`과 volume 삭제는 사용하지 않습니다.

```bash
sudo cp -a /etc/nginx/sites-available/crawling-project.pre-ddarung /etc/nginx/sites-available/crawling-project
sudo nginx -t
sudo systemctl reload nginx
curl -s -o /dev/null -w '%{http_code}\n' https://shdomain.kro.kr/
docker compose -p app -f /home/ubuntu/app/docker-compose.yml ps
cd /home/ubuntu/ddarung-flow-staging
docker compose --env-file .env --env-file oauth.env --env-file release.env -f docker-compose.yaml stop
```

명시적 전환·중지 뒤 다음을 기록합니다.

- 비상 중지 지시와 실행 시각
- 종료 시 container 상태와 마지막 정상 tag
- OCI Console 예상 비용 0원 여부
- 계속 실행 중인 `crawling_server`, 크롤링 컨테이너 3개의 healthy 상태와 OCIR repository
- 실제 secret 노출 없음

## 실패 분류

| 상태 | 확인 | 조치 |
|---|---|---|
| CPU·메모리·disk 여유 부족 | 공유 서버 공존 불가 | 크롤링 서비스를 건드리지 않고 따릉이 프로젝트만 중지 |
| `exec format error` | image/instance architecture | `TARGET_PLATFORM`과 shape 대조 후 재build |
| OCIR 401/403 | local 또는 server registry login/IAM | token을 출력하지 않고 로그인·정책 재확인 |
| SSH 실패 | source IP, port 22, host key, 사용자 | NSG와 host key를 확인; key 공유 금지 |
| frontend 접속 실패 | loopback 3100, host nginx와 container | `ps`, nginx route와 제한 로그 확인 |
| backend/DB 실패 | postgres health와 backend 로그 | application code를 고치지 않고 원 작업으로 반환 |
| rollback 실패 | 이전 tag 존재와 digest | 임의 tag 또는 DB 초기화 금지 |
| secret 노출 | 화면·로그·history | 즉시 중지하고 credential 폐기·교체 후 별도 사고 기록 |

## OPS-3.4 완료 증거

- 승인 main SHA와 CI URL
- frontend/backend SHA tag와 immutable digest
- 마스킹한 runtime 식별 정보와 lifecycle mode
- 최초 기동 frontend/backend/DB smoke
- 새 승인 버전 갱신 전후 결과
- 직전 정상 image rollback 결과
- 비용 0원과 secret scan 결과
- Google·Kakao·Naver authorization redirect의 HTTPS callback 확인과 실제 로그인 결과
- 미완성 기능과 OPS-5.1 잔여 범위

`배포 가능`은 위 작업을 시작해도 된다는 뜻이며, 모든 증거가 확보되기 전에는 `완료`가 아닙니다.

# Local Docker staging

OPS-3.3은 frontend, backend, PostgreSQL을 하나의 Docker Compose network에서 실행하는 비운영 로컬 기준선입니다. OCI, 실제 OAuth, 외부 API key, 운영 데이터와 자동 배포는 포함하지 않습니다.

## 실행 구조

```text
browser -> localhost:3000 -> frontend nginx -> backend:8080 -> postgres:5432
                              /api/ proxy       JDBC connection
```

- 브라우저 화면: `http://localhost:3000`
- backend 직접 진단: `http://localhost:8080`
- PostgreSQL은 호스트에 포트를 공개하지 않습니다.
- `.env.example` 값은 로컬 실행 예시이며 실제 credential이 아닙니다.
- OAuth 기능은 `local-disabled` 자리표시자로 비활성 상태입니다.

## 준비 사항

- Docker Desktop과 Docker Compose
- Node.js 24와 npm
- Java 21
- PowerShell

저장소 루트에서 다음 명령을 실행합니다. `.env.example`을 실제 비밀값 저장소로 사용하지 않습니다.

## 애플리케이션 검증

```powershell
cd frontend
npm ci
npm test -- --watchAll=false
npm run build

cd ..\backend
.\gradlew.bat test

cd ..
```

기존 테스트나 build가 실패하면 Docker 설정으로 숨기지 않고 해당 실패를 기록합니다.

## Compose 설정과 image build

```powershell
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml config
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml build
```

`config` 출력에는 실제 비밀값이 없어야 합니다. 두 multi-stage image build가 모두 성공해야 다음 단계로 진행합니다.

## 최초 기동과 상태 확인

```powershell
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml up -d
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml ps
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml logs --no-color --tail 100
```

성공 조건:

- `postgres`가 `healthy`입니다.
- `backend`와 `frontend`가 실행 중이며 반복 재시작하지 않습니다.
- 브라우저에서 `http://localhost:3000`의 React 화면이 표시됩니다.
- backend 직접 요청과 frontend `/api/` proxy 요청이 각각 HTTP 응답을 반환합니다.
- backend 로그에서 PostgreSQL 연결과 애플리케이션 시작을 확인합니다.

Windows PowerShell 5.1에서도 동작하는 `curl.exe`로 HTTP 연결을 확인합니다. backend가 준비될 때까지 1초 간격으로 최대 30회 기다린 뒤 proxy를 확인합니다.

```powershell
$frontendStatus = [int](curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000)
if ($frontendStatus -ne 200) { throw "frontend HTTP check failed: $frontendStatus" }

$backendStatus = 0
for ($attempt = 1; $attempt -le 30; $attempt++) {
    $backendStatus = [int](curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/api/v1/auth/me)
    if ($backendStatus -in @(200, 401, 403)) { break }
    Start-Sleep -Seconds 1
}

if ($backendStatus -notin @(200, 401, 403)) {
    docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml ps
    docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml logs --no-color --tail 100
    throw "backend was not ready within 30 seconds: $backendStatus"
}

$proxyStatus = [int](curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/api/v1/auth/me)
if ($proxyStatus -ne $backendStatus) { throw "backend/proxy status mismatch: $backendStatus/$proxyStatus" }

"frontend=$frontendStatus backend=$backendStatus proxy=$proxyStatus"
```

인증되지 않은 `/api/v1/auth/me` 요청은 `401` 또는 `403`일 수 있습니다. 직접 요청과 proxy 요청이 동일한 인증 계열 상태를 반환하면 연결 경로가 동작한 것입니다.

## 종료와 volume 보존 재기동

일반 종료는 컨테이너와 network만 내리고 이름 있는 PostgreSQL volume을 보존합니다.

```powershell
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml down
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml up -d
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml ps
```

재기동 후에도 위의 HTTP 확인 명령을 다시 실행해 backend 준비를 기다린 뒤, 최초 기동과 동일한 화면, HTTP 응답, DB 연결 조건을 확인합니다. 검증이 끝나면 volume을 보존한 채 종료합니다.

```powershell
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml down
```

`docker compose down -v`는 DB volume을 제거하므로 OPS-3.3 기본 절차에서 사용하지 않습니다.

## 실패 판정과 로그

다음 중 하나라도 발생하면 완료가 아닙니다.

- image build 또는 기존 테스트 실패
- `postgres`가 `healthy`가 되지 않음
- backend DB 연결 실패 또는 컨테이너 반복 재시작
- frontend 빈 화면 또는 `/api/` proxy 실패
- 실제 credential 없이는 시작할 수 없음
- 허용된 8개 파일 밖의 애플리케이션 변경이 필요함

실패 시 상태와 마지막 로그를 기록합니다.

```powershell
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml ps
docker compose --env-file infra/staging/.env.example -f infra/staging/docker-compose.yaml logs --no-color --tail 100
```

## 제출 전 범위 확인

```powershell
git status --short
git diff --name-only origin/main...HEAD
```

허용된 신규 파일은 다음 8개뿐입니다.

- `frontend/Dockerfile`
- `frontend/.dockerignore`
- `frontend/nginx.staging.conf`
- `backend/Dockerfile`
- `backend/.dockerignore`
- `infra/staging/docker-compose.yaml`
- `infra/staging/.env.example`
- `infra/staging/README.md`

`.env`, `.local-harness/`, `AGENTS.md`, `.claude/`와 실제 credential은 stage, commit, log 또는 화면 캡처에 포함하지 않습니다. PR은 조장 검토 요청이며 직접 병합 권한을 의미하지 않습니다.

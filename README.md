# 따릉이 도착시점 대여 가능성 서비스

사용자가 출발지와 자전거를 빌리려는 장소를 입력하면 도착 예정 시각을 계산하고, 주변 대여소에 자전거가 1대 이상 남아 있을 가능성을 `높음·중간·낮음`으로 안내하는 소비자용 PC 웹 서비스입니다. 가능성이 낮으면 거리, 이동시간과 대여 가능성을 함께 고려한 대체 대여소를 보여 줍니다.

프로젝트 범위와 기술 선택의 공식 기준은 Notion의 **MVP 확정 범위와 기술 스택 — 소비자용** 문서입니다. 저장소 문서는 해당 확정 내용을 구현 관점에서 요약하며, Notion에서 아직 확정되지 않은 내용을 임의로 결정하지 않습니다.

## 핵심 사용자 흐름

1. 사용자가 Kakao 지도에서 현재 재고와 주변 대여소를 확인합니다.
2. 출발지, 목적지와 도보·대중교통 또는 직접 예상시간을 입력합니다.
3. 예측 실행 시 Kakao·Naver·Google 중 하나로 로그인합니다.
4. 후보 대여소별 도착 예정 시각에 자전거가 1대 이상 있을 가능성을 확인합니다.
5. 가능성이 낮으면 반경 500m, 후보 부족 시 1km 안의 대체 대여소를 최대 5곳 비교합니다.
6. 상세 화면에서 확률 범위, 현재 재고, 주요 근거와 데이터 기준시각을 확인합니다.

사용자가 요청할 때마다 모델을 실행하지 않습니다. 모든 대여소와 예측 시간 구간의 결과를 주기적으로 미리 계산하고, Spring API가 최신 정상 결과를 조회합니다.

## 확정 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | React 18, JavaScript/JSX, Create React App, Axios |
| 지도·장소·경로 | Kakao Maps·Local·Routing API |
| 백엔드 | Java 21, Spring Boot 3.5, Gradle Wrapper |
| 인증 | Spring Security, OAuth 2.0/OIDC, PostgreSQL 서버 세션, HttpOnly 쿠키 |
| 데이터베이스 | PostgreSQL, Spring Data JPA, `schema.sql`, `ddl-auto=validate` |
| 데이터 처리 | Python, Pandas, PyArrow, Airflow, OCI Python SDK |
| 파일 저장 | OCI Object Storage의 비공개 버킷, Raw JSON, Quarantine, Curated Parquet |
| 로컬 통합·배포 | Docker Compose, Nginx, OCI Compute |
| 테스트 | JUnit 5, Spring Boot Test, pytest |
| CI/CD | GitHub Actions |
| 기본 모니터링 | Grafana, Prometheus, Node Exporter, Spring Boot Actuator |

현재 MVP에는 DuckDB, Polars, PySpark, MinIO를 사용하지 않습니다. 데이터 처리 표준은 Pandas와 PyArrow이며, 파일은 OCI Object Storage에 저장합니다. 기술 변경은 실제 병목과 검증 결과를 근거로 Notion에서 먼저 승인한 뒤 반영합니다.

## 데이터 흐름

```text
서울 열린데이터·실시간 API와 날씨 데이터
→ Airflow 수집
→ OCI Object Storage Raw JSON
→ Pandas·PyArrow 검증·정제·결합
→ Quarantine 또는 Curated Parquet
→ 확정 모델 기반 배치 예측
→ 검증된 최신 결과를 PostgreSQL에 게시
→ Spring API
→ React·Kakao 지도
```

## 저장소 구성

| 폴더 | 역할 |
|---|---|
| `frontend/` | 소비자용 React 화면 |
| `backend/` | Spring Boot API, 인증과 서비스 로직 |
| `pipeline/` | 데이터 수집·검증·정제·배치 예측 |
| `infra/` | Docker Compose, Airflow, PostgreSQL, Nginx와 배포 설정 |
| `docs/` | Notion에서 승인된 API·데이터 계약, ERD와 구현용 설계 |

현재 저장소는 기능별 기본 골격을 구성하는 단계입니다. 위 표의 기술이 모두 구현되었다는 뜻은 아니며, 주차별 선행조건과 승인된 작업서에 따라 추가합니다.

## 로컬 실행 준비

필요한 프로그램:

- Node.js 18 이상
- Java 21

프론트엔드:

```powershell
cd frontend
npm install
npm start
```

프론트엔드 테스트와 빌드:

```powershell
cd frontend
npm test -- --watchAll=false
npm run build
```

백엔드 테스트:

```powershell
cd backend
.\gradlew.bat test
```

백엔드 실행:

```powershell
cd backend
.\gradlew.bat bootRun
```

Python 파이프라인과 Docker Compose 실행 명령은 해당 구현과 의존성 명세가 승인된 뒤 추가합니다.

## 작업 규칙

1. Notion의 공식 일정, 계약과 승인된 작업서를 먼저 확인합니다.
2. 자신의 브랜치와 허용된 폴더·파일만 수정합니다.
3. 계약과 다른 점을 발견하면 임의로 변경하지 않고 조장에게 요청합니다.
4. 실제 `.env`, 비밀번호, 토큰, OAuth 키와 개인정보는 커밋하지 않습니다.
5. 테스트·빌드·화면 또는 DB 확인 결과와 PR을 제출하고 직접 병합하지 않습니다.
6. 완료 기준과 증거 없이 작업이나 주차를 완료로 표시하지 않습니다.

`test1.py`, `test2.py`, `TSETS.PY`는 기존 임시 파일이므로 별도 정리 결정 전까지 유지합니다.

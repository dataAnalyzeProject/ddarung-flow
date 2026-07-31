# 로컬 통합과 운영 환경

React, Spring Boot, PostgreSQL, Airflow와 Nginx를 함께 실행하기 위한 Docker Compose 및 OCI 배포 설정을 두는 영역입니다.

## 확정 운영 기준

- 운영·시연 서버: OCI Compute 2 OCPU, RAM 12GB
- 상시 실행 대상: Nginx, React 빌드 결과, Spring Boot, PostgreSQL, Airflow
- Airflow: 단일 서버용 LocalExecutor, 초기 동시 작업 수와 DAG 동시 실행 수 각각 1
- 파일 저장: OCI Object Storage 비공개 개발·운영 버킷
- 서비스 DB와 Airflow 메타데이터 DB: 하나의 PostgreSQL 컨테이너 안에서 데이터베이스와 사용 권한 분리
- 외부 공개 포트: 웹 접속용 80·443
- Spring Boot와 PostgreSQL 포트: 외부에 직접 공개하지 않음

MinIO는 사용하지 않습니다. Raw JSON, Quarantine, Curated Parquet, 모델과 품질 산출물은 OCI Compute 디스크가 아니라 OCI Object Storage에 보관합니다.

## 배포와 보안 기준

- `main`에 병합되고 React·Spring Boot 테스트와 빌드가 성공한 코드만 배포합니다.
- CI/CD는 GitHub Actions를 사용합니다.
- OAuth Client Secret, PostgreSQL 비밀번호와 데이터 API 키는 저장소에 기록하지 않습니다.
- 저장소에는 실제 값이 없는 `.env.example`만 둡니다.
- 외부에는 80·443만 공개하고 SSH 22는 조장 관리용으로 제한합니다.
- 최근 정상 배포본 2개와 PostgreSQL 최근 7일 백업을 유지하는 것을 기본선으로 합니다.

## 현재 상태

현재는 기능별 기본 골격 단계이므로 Docker Compose, Nginx, Airflow, PostgreSQL과 OCI 설정이 아직 구현되지 않았습니다. 세부 설정은 승인된 아키텍처·데이터 계약·배포 설계와 주차별 선행조건을 확인한 뒤 추가합니다.

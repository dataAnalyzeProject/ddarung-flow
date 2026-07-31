# 설계 문서

이 폴더에는 Notion에서 검토·승인된 내용을 구현자가 사용할 수 있는 계약과 설계 산출물로 옮겨 둡니다. 프로젝트 범위와 기술 스택의 공식 기준은 Notion이며, 확정되지 않은 내용을 코드의 사실처럼 적지 않습니다.

## 작성 대상

- 소비자용 시스템 아키텍처
- 화면과 서버 사이의 API 요청·응답 계약
- 소셜 로그인과 로그인 후 입력값 복귀 흐름
- Raw·Quarantine·Curated·예측 게시 데이터 계약
- ERD와 `schema.sql`
- Airflow 배치, 검증과 PostgreSQL 게시 계약
- 운영 배포·백업·복원 절차

계약과 구현이 다르면 구현자가 임의로 문서를 바꾸지 않고 조장에게 변경 요청을 전달합니다.

## 확정 기술 기준

- 프론트엔드는 Create React App, React와 JavaScript/JSX를 사용합니다.
- 화면 컴포넌트는 `.jsx`, 일반 JavaScript 모듈은 `.js`를 사용합니다.
- 프로젝트 진행 중 Vite나 TypeScript로 전환하지 않습니다.
- 백엔드는 Java 21, Spring Boot 3.5와 PostgreSQL을 사용합니다.
- 데이터 처리는 Python, Pandas, PyArrow와 Airflow를 사용합니다.
- Raw·Quarantine·Curated·모델 산출물은 OCI Object Storage에 보관합니다.
- DuckDB, Polars, PySpark와 MinIO는 현재 MVP 기술 스택에 포함하지 않습니다.

공통 골격, 기술 스택과 계약을 바꾸는 작업은 Notion에서 영향 범위와 검증 기준을 기록하고 조장 승인 후 진행합니다.

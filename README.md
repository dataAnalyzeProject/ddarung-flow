# ddarung-flow

따릉이 대여소의 60·120·180분 후 부족 위험을 확인하는 운영 지원 MVP입니다.

## 기본 구조

- `frontend/`: React + TypeScript + Vite 화면
- `backend/`: Java 21 + Spring Boot 3.5 서비스 API
- `pipeline/`: Python + Pandas + Airflow 데이터 처리
- `infra/`: Docker Compose 등 로컬 실행환경
- `docs/`: 설계 및 협업 문서

현재 커밋은 팀 작업을 시작하기 위한 기본 골자만 제공합니다. 세부 구현은 담당 영역별 작업으로 추가합니다.

## 작업 원칙

- 담당 폴더 밖의 파일을 수정해야 하면 먼저 팀에 공유합니다.
- 화면 작업은 우선 임시 데이터로 구현할 수 있습니다.
- `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/pages/`, `frontend/src/shared/`의 통합 변경은 통합 담당자가 관리합니다.
- 기존 테스트용 파일은 초기 정리 전까지 보존합니다.

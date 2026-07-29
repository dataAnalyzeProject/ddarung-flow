# Frontend

React, TypeScript, Vite 기반 화면 영역입니다.

초기 화면 작업은 실제 서버 없이 임시 데이터로 구현할 수 있습니다.

## 담당 경계

- `src/features/auth/`: 로그인, 사용자 정보, 관심 대여소
- `src/features/map-dashboard/`: 지도, 검색, 필터, 예측시간 선택
- `src/features/station-detail/`: 대여소 상세, 관심 등록, 관리자 검토
- `src/pages/`: 기능 화면을 조립하는 영역
- `src/shared/`: 여러 화면이 함께 사용하는 코드

각 담당자는 자신의 `features` 폴더를 우선 수정합니다. 공통 파일 또는 다른 담당자의 폴더를 수정해야 하면 먼저 팀에 공유합니다.

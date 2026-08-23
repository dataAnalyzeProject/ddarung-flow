# 따라가요 관리자 fixture UI

`AdminApp`은 실제 라우트에 연결하지 않는 검토용 React 조립 컴포넌트입니다. `actorRole`, `viewState`, `activeMenuId`, fixture 데이터와 `onAction` callback만 입력으로 받습니다.

- 포함: 대시보드, 사용자·권한, 데이터·Export, 감사 로그, ModelOps, Q&A 관리와 역할/상태별 표시.
- 제외: 실제 세션, 서버 RBAC, API adapter, DB 변경, Export 생성·다운로드, 모델 실행·배포, 감사 저장.
- 모든 action은 `{ type, ...payload }` callback만 보내며 UI가 성공 상태를 확정하지 않습니다.
- `PRIVATE` fixture는 제목을 제외한 원문과 개인정보를 표시하지 않습니다.

브랜드 로고와 일반 자전거 일러스트는 기존 추적 자산을 읽기 전용으로 사용합니다.

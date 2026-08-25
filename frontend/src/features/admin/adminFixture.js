export const ADMIN_ROLES = {
  ADMIN: "ADMIN",
  USER: "USER",
  ANONYMOUS: "ANONYMOUS",
};

export const ADMIN_VIEW_STATES = ["loading", "success", "empty", "error", "forbidden"];

export const adminMenus = [
  { id: "dashboard", label: "대시보드", icon: "▦" },
  { id: "users", label: "사용자 · 권한", icon: "♙" },
  { id: "export", label: "데이터 · Export", icon: "⇩" },
  { id: "audit", label: "감사 로그", icon: "◫" },
  { id: "modelops", label: "ModelOps", icon: "◇" },
  { id: "qna", label: "Q&A 관리", icon: "◌" },
];

export const menuAccess = Object.fromEntries(adminMenus.map(({ id }) => [id, [ADMIN_ROLES.ADMIN]]));
export const roleLabels = { ADMIN: "관리자" };

export const fixture = {
  referenceTime: "2026.08.21 21:30 · fixture 기준",
  users: [
    { id: "usr-101", name: "운영 담당 A", role: "ADMIN", status: "활성", scope: "관리자 기능", updated: "21:04" },
    { id: "usr-102", name: "관리 담당 B", role: "ADMIN", status: "활성", scope: "관리자 기능", updated: "20:51" },
    { id: "usr-103", name: "관리 담당 C", role: "ADMIN", status: "활성", scope: "관리자 기능", updated: "18:20" },
  ],
  exports: [
    { id: "EXP-240821-04", type: "정거장 가용성 집계", requester: "ADMIN", state: "완료", progress: 100, time: "21:10" },
    { id: "EXP-240821-03", type: "예측 결과 요약", requester: "ADMIN", state: "생성 중", progress: 68, time: "20:42" },
    { id: "EXP-240821-02", type: "Curated 품질 현황", requester: "ADMIN", state: "대기", progress: 0, time: "19:25" },
    { id: "EXP-240821-01", type: "오류 샘플", requester: "ADMIN", state: "실패", progress: 42, time: "18:20", reason: "fixture 생성 중 형식 검증에 실패했습니다." },
    { id: "EXP-240820-09", type: "보관 기간 경과", requester: "ADMIN", state: "만료", progress: 100, time: "전일", reason: "다운로드 가능 기간이 지났습니다." },
  ],
  audit: [
    { time: "21:18:24", action: "MODEL_VALIDATE", actor: "ADMIN", target: "모델 v17 검증", result: "성공" },
    { time: "21:10:04", action: "DATA_EXPORT_REQUEST", actor: "ADMIN", target: "정거장 가용성 집계", result: "성공" },
    { time: "20:51:38", action: "MODEL_APPROVE", actor: "ADMIN", target: "모델 v17 승인", result: "성공" },
    { time: "19:25:13", action: "QNA_STATUS_CHANGE", actor: "ADMIN", target: "문의 #Q-102 상태 변경", result: "성공" },
  ],
  models: [
    { version: "v17", state: "ACTIVE", accuracy: "0.932", delay: "96ms", drift: "0.07", owner: "ADMIN" },
    { version: "v16", state: "APPROVED", accuracy: "0.901", delay: "118ms", drift: "0.11", owner: "ADMIN" },
    { version: "v15", state: "VALIDATED", accuracy: "0.872", delay: "142ms", drift: "0.18", owner: "ADMIN" },
  ],
  qna: [
    { id: "Q-104", category: "예측 결과", title: "추천 결과의 기준이 궁금합니다", visibility: "PUBLIC", state: "OPEN", updated: "21:16" },
    { id: "Q-103", category: "이용 방법", title: "도착 예정 시간을 바꾸고 싶어요", visibility: "PUBLIC", state: "ANSWERED", updated: "20:44" },
    { id: "Q-102", category: "계정", title: "비공개 문의가 있습니다", visibility: "PRIVATE", state: "OPEN", updated: "19:25" },
    { id: "Q-101", category: "데이터", title: "정거장 정보 갱신 시점은 언제인가요", visibility: "PUBLIC", state: "CLOSED", updated: "18:50" },
    { id: "Q-100", category: "이용 방법", title: "추천 정거장 수를 바꿀 수 있나요", visibility: "PUBLIC", state: "ANSWERED", updated: "17:32" },
    { id: "Q-099", category: "예측 결과", title: "예측 실패 안내가 표시됩니다", visibility: "PUBLIC", state: "CLOSED", updated: "16:13" },
    { id: "Q-098", category: "계정", title: "문의 내역 공개 범위를 확인하고 싶습니다", visibility: "PRIVATE", state: "HIDDEN", updated: "15:28" },
    { id: "Q-097", category: "기타", title: "서비스 개선 의견을 남깁니다", visibility: "PUBLIC", state: "OPEN", updated: "14:41" },
  ],
};

export function canAccess(role, menuId) {
  return Boolean(menuAccess[menuId]?.includes(role));
}

export function canDo(role, action) {
  const rules = {
    export_request: [ADMIN_ROLES.ADMIN], validate_model: [ADMIN_ROLES.ADMIN], approve_model: [ADMIN_ROLES.ADMIN],
    activate_model: [ADMIN_ROLES.ADMIN], rollback_model: [ADMIN_ROLES.ADMIN], answer_qna: [ADMIN_ROLES.ADMIN],
    change_qna_state: [ADMIN_ROLES.ADMIN], hide_qna: [ADMIN_ROLES.ADMIN], change_role: [ADMIN_ROLES.ADMIN],
  };
  return Boolean(rules[action]?.includes(role));
}

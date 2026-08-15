export const notificationRulesFixture = [
  { id: "rule-arrival-high", name: "도착 가능성 높음", on: true },
  { id: "rule-inventory-one-or-more", name: "현재 재고 1대 이상", on: true },
];

export const notificationsFixture = [
  {
    id: "notification-arrival-high",
    title: "저장 대여소의 도착 대여 가능성이 높아요",
    detail: "성수역 3번 출구 · 예상 성공률 87%",
    time: "10분 전",
    action: "예측 상세로 이동",
    kind: "trend",
    unread: true,
  },
  {
    id: "notification-route-updated",
    title: "저장 경로의 예측 정보가 업데이트됐어요",
    detail: "성수역 → 서울숲",
    time: "1시간 전",
    action: "다시 조회",
    kind: "route",
    unread: true,
  },
  {
    id: "notification-data-update",
    title: "데이터 업데이트 안내",
    detail: "최신 대여소 정보가 반영되었습니다.",
    time: "어제",
    action: "알림 상세 확인",
    kind: "bell",
    unread: false,
  },
];

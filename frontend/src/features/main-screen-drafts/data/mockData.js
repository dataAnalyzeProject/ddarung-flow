export const serviceData = {
  serviceName: "따릉이 도착 대여 예측",
  eyebrow: "SEOUL BIKE PREDICT",
  description: "도착할 때 빌릴 수 있는 따릉이를 미리 확인하세요.",
  originLabel: "출발지",
  originPlaceholder: "출발지를 입력하세요",
  destinationLabel: "목적지",
  destinationPlaceholder: "목적지를 입력하세요",
  modes: ["도보", "대중교통"],
  selectedMode: "도보",
  predictButton: "대여 가능성 예측",
  mapLabel: "예측 지도",
  resultTitle: "목적지 주변 대여소",
  resultSummary: "예상 도착시간 기준 추천 결과",
  loginNotice: "로그인하면 자주 가는 경로와 예측 기록을 저장할 수 있어요.",
  loginButton: "로그인",
};

export const stations = [
  {
    id: "station-1",
    name: "성수역 3번 출구",
    distance: "도착지에서 120m",
    bikes: 8,
    arrivalTime: "오후 2:32",
    availability: "높음",
    probability: "87%",
    role: "추천 대여소",
  },
  {
    id: "station-2",
    name: "성수동 카페거리",
    distance: "도착지에서 310m",
    bikes: 5,
    arrivalTime: "오후 2:35",
    availability: "중간",
    probability: "62%",
    role: "대체 대여소 1",
  },
  {
    id: "station-3",
    name: "서울숲 남문",
    distance: "도착지에서 480m",
    bikes: 2,
    arrivalTime: "오후 2:39",
    availability: "낮음",
    probability: "31%",
    role: "대체 대여소 2",
  },
];

export const mapRoads = [
  { id: "road-a", className: "road road-a" },
  { id: "road-b", className: "road road-b" },
  { id: "road-c", className: "road road-c" },
  { id: "road-d", className: "road road-d" },
];


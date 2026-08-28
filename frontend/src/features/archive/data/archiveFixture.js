export const savedStationsFixture = [
  {
    id: "station-seongsu-3",
    name: "성수역 3번 출구",
    meta: "도보 2분 · 마지막 확인 10:32",
    current: 8,
    arrival: "5~9대",
    rate: 87,
    color: "#08a36f",
  },
  {
    id: "station-seongsu-cafe",
    name: "성수동 카페거리",
    meta: "도보 4분 · 마지막 확인 10:32",
    current: 5,
    arrival: "2~5대",
    rate: 72,
    color: "#0b68ee",
  },
];

export const archiveSummaryFixture = {
  savedStations: 2,
  savedRoutes: 1,
  predictionHistory: 1,
};

export const predictionHistoryScoreFixture = {
  items: [{ id: 1, stationName: "성수역 3번 출구", requiredBikeCount: 2, predictionTargetAt: "2026-08-27T01:00:00+09:00", availabilityLevel: "HIGH", actualBikeCount: 4, outcome: "HIT" }, { id: 2, stationName: "서울숲 남문", requiredBikeCount: 1, predictionTargetAt: "2026-08-27T02:00:00+09:00", availabilityLevel: "HIGH", actualBikeCount: 0, outcome: "MISS" }, { id: 3, stationName: "뚝섬역", requiredBikeCount: 2, predictionTargetAt: "2026-08-28T01:00:00+09:00", availabilityLevel: "MEDIUM", outcome: "NOT_DUE" }, { id: 4, stationName: "잠실역", requiredBikeCount: 2, predictionTargetAt: "2026-08-27T03:00:00+09:00", availabilityLevel: "LOW", outcome: "UNVERIFIABLE" }],
  scoreSummary: { scoredCount: 2, hitCount: 1, hitRate: 0.5, byLevel: { HIGH: { scoredCount: 2, hitCount: 1 }, MEDIUM: { scoredCount: 0, hitCount: 0 }, LOW: { scoredCount: 0, hitCount: 0 } } },
};

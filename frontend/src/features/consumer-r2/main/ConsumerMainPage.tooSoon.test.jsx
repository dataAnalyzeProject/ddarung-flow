import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConsumerMainPage from "./ConsumerMainPage.jsx";

const places = {
  origin: { providerId: "origin-place", name: "서울역", latitude: 37.5547, longitude: 126.9707 },
  destination: { providerId: "destination-place", name: "서울역광장", latitude: 37.555, longitude: 126.972 },
};

const routeDetail = {
  distanceMeters: 420,
  durationSeconds: 480,
  travelMode: "PUBLIC_TRANSIT",
  pathPoints: [
    { latitude: 37.5547, longitude: 126.9707 },
    { latitude: 37.555, longitude: 126.972 },
  ],
  transfers: 0,
  fare: 0,
  steps: [],
};

function createCandidate(overrides = {}) {
  return {
    stationId: "ST-NEAR",
    stationName: "서울역 가까운 대여소",
    latitude: 37.555,
    longitude: 126.972,
    predictionProbability: null,
    predictionStatus: "TOO_SOON",
    availabilityLevel: null,
    routeStatus: "NORMAL",
    routeDetail,
    arrivalAt: "2026-09-08T14:25:00+09:00",
    requiredBikeCount: 1,
    availableBikeCount: 4,
    inventoryStatus: "NORMAL",
    inventoryCollectedAt: "2026-09-08T14:15:00+09:00",
    predictionTargetAt: "2026-09-08T14:00:00+09:00",
    horizonMinutes: null,
    featureAsOf: null,
    expiresAt: null,
    ...overrides,
  };
}

function createServices(candidate) {
  return {
    clearPendingPrediction: jest.fn(),
    fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates: [candidate] }),
    fetchStationDetail: jest.fn(),
    fetchStationLocations: jest.fn(),
    getCurrentUser: jest.fn().mockResolvedValue({ authenticated: true, user: { id: "user-1", displayName: "김따릉" } }),
    loadPendingPrediction: jest.fn().mockReturnValue({ travelMode: "PUBLIC_TRANSIT", requiredBikeCount: 1, routePlaces: places }),
    savePendingPrediction: jest.fn(),
    saveRecentSearch: jest.fn(),
    createSearchRecheck: jest.fn(),
    searchPlaces: jest.fn(),
  };
}

function PreviewMap({ routeDetail: detail }) {
  return <div aria-label="테스트 경로 지도">경로 {detail.distanceMeters}m</div>;
}

async function searchWith(candidate) {
  render(<ConsumerMainPage services={createServices(candidate)} mapRenderer={PreviewMap} />);
  const compare = await screen.findByRole("button", { name: "대여 가능성 비교" });
  await waitFor(() => expect(compare).toBeEnabled());
  fireEvent.click(compare);
  return screen.findByRole("button", { name: new RegExp(candidate.stationName) });
}

test("TOO_SOON explains that current inventory replaces a near-term probability", async () => {
  const card = await searchWith(createCandidate());

  expect(card).toHaveTextContent("현재 재고 참고");
  expect(card).toHaveTextContent("도착 시점이 가까워 미래 예측 대신 최신 현재 재고를 안내합니다.");
  expect(card).not.toHaveTextContent("예측 또는 경로 근거를 확인할 수 없습니다.");
  expect(screen.getAllByText("현재 재고 참고").length).toBeGreaterThanOrEqual(2);

  fireEvent.click(screen.getByRole("button", { name: "대중교통 경로 상세" }));
  const detail = await screen.findByLabelText("선택한 대여소의 대중교통 경로 상세");
  expect(detail).toHaveTextContent("현재 재고 참고");
  expect(detail).toHaveTextContent("도착 시점이 가까워 미래 예측 대신 최신 현재 재고를 안내합니다.");
});

test("generic prediction unavailability keeps the unavailable wording instead of claiming a short trip", async () => {
  const card = await searchWith(createCandidate({
    stationId: "ST-UNAVAILABLE",
    stationName: "예측 지원 범위 밖 대여소",
    predictionStatus: "UNAVAILABLE",
  }));

  expect(card).toHaveTextContent("확인 불가");
  expect(card).toHaveTextContent("예측 또는 경로 근거를 확인할 수 없습니다.");
  expect(card).not.toHaveTextContent("현재 재고 참고");
  expect(card).not.toHaveTextContent("도착 시점이 가까워 미래 예측 대신 최신 현재 재고를 안내합니다.");
});

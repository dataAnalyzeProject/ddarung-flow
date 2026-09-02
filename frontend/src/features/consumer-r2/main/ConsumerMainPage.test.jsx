import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConsumerMainPage from "./ConsumerMainPage.jsx";

const places = {
  origin: { name: "서울역", address: "서울 중구", latitude: 37.5547, longitude: 126.9707 },
  destination: { name: "서울숲", address: "서울 성동구", latitude: 37.5444, longitude: 127.0374 },
};

const routeDetail = {
  distanceMeters: 3100,
  durationSeconds: 1080,
  travelMode: "PUBLIC_TRANSIT",
  pathPoints: [{ latitude: 37.5547, longitude: 126.9707 }, { latitude: 37.5444, longitude: 127.0374 }],
  transfers: 1,
  fare: 1400,
  steps: [{ type: "SUBWAY", guidance: "1호선에서 2호선으로 환승", distanceMeters: 2600, durationSeconds: 780, vehicles: [{ name: "2호선", type: "SUBWAY" }] }],
};

const candidates = [
  {
    stationId: "ST-1", stationName: "서울숲역 2번 출구", latitude: 37.544, longitude: 127.038,
    predictionProbability: 0.91, predictionStatus: "NORMAL", availabilityLevel: "HIGH",
    routeStatus: "NORMAL", routeDetail, distanceMeters: 3100, durationSeconds: 1080,
    arrivalAt: "2026-09-02T18:20:00+09:00", requiredBikeCount: 1,
  },
  {
    stationId: "ST-2", stationName: "뚝섬역 1번 출구", latitude: 37.548, longitude: 127.047,
    predictionProbability: 0.73, predictionStatus: "NORMAL", availabilityLevel: "MEDIUM",
    routeStatus: "NORMAL", routeDetail: { ...routeDetail, durationSeconds: 1260 }, distanceMeters: 3500, durationSeconds: 1260,
    arrivalAt: "2026-09-02T18:23:00+09:00", requiredBikeCount: 1,
  },
];

function createServices(overrides = {}) {
  return {
    clearPendingPrediction: jest.fn(),
    fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates }),
    getCurrentUser: jest.fn().mockResolvedValue({ displayName: "김따릉" }),
    loadPendingPrediction: jest.fn().mockReturnValue({ travelMode: "PUBLIC_TRANSIT", requiredBikeCount: 1, routePlaces: places }),
    savePendingPrediction: jest.fn(),
    searchPlaces: jest.fn(),
    ...overrides,
  };
}

function PreviewMap({ routeDetail: detail }) {
  return <div aria-label="테스트 경로 지도">경로 {detail.distanceMeters}m</div>;
}

test("shows only the input workspace before a result and restores completed place selections", async () => {
  render(<ConsumerMainPage services={createServices()} mapRenderer={PreviewMap} />);

  expect(await screen.findByRole("heading", { name: /도착할 때 빌릴 수 있는/ })).toBeInTheDocument();
  expect(screen.getByText("서울역")).toBeInTheDocument();
  expect(screen.getByText("서울숲")).toBeInTheDocument();
  expect(screen.queryByLabelText("테스트 경로 지도")).not.toBeInTheDocument();
  expect(screen.queryByText("추천 대여소")).not.toBeInTheDocument();
});

test("uses the route response once and changes candidate/detail views without refetching", async () => {
  const services = createServices();
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);

  fireEvent.click(await screen.findByRole("button", { name: "도착할 때 빌릴 곳 찾기" }));
  expect(await screen.findByRole("heading", { name: "추천 대여소" })).toBeInTheDocument();
  expect(screen.getAllByText("91%")).toHaveLength(2);
  expect(screen.getByLabelText("테스트 경로 지도")).toHaveTextContent("3100m");

  fireEvent.click(screen.getByRole("button", { name: /뚝섬역 1번 출구/ }));
  const detailButton = screen.getByRole("button", { name: "대중교통 경로 상세" });
  expect(detailButton).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(detailButton);
  expect(screen.getByRole("button", { name: "경로 상세 닫기" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("heading", { name: "뚝섬역 1번 출구까지 가는 길" })).toBeInTheDocument();
  expect(screen.getByText("1호선에서 2호선으로 환승")).toBeInTheDocument();
  expect(screen.getByText(/1,400원/)).toBeInTheDocument();
  expect(services.fetchRouteCandidates).toHaveBeenCalledTimes(1);
});

test("preserves input and redirects anonymous users before requesting results", async () => {
  const onLogin = jest.fn();
  const services = createServices({ getCurrentUser: jest.fn().mockRejectedValue({ status: 401 }) });
  render(<ConsumerMainPage services={services} onLogin={onLogin} />);

  await waitFor(() => expect(services.getCurrentUser).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "도착할 때 빌릴 곳 찾기" }));

  expect(services.savePendingPrediction).toHaveBeenCalledWith(expect.objectContaining({ requiredBikeCount: 1 }), places);
  expect(onLogin).toHaveBeenCalledTimes(1);
  expect(services.fetchRouteCandidates).not.toHaveBeenCalled();
});

test("separates a route fetch error from the map runtime", async () => {
  const services = createServices({ fetchRouteCandidates: jest.fn().mockRejectedValue(new Error("CANDIDATE_FETCH_FAILED")) });
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);

  fireEvent.click(await screen.findByRole("button", { name: "도착할 때 빌릴 곳 찾기" }));
  expect(await screen.findByRole("heading", { name: "추천 결과를 불러오지 못했습니다" })).toBeInTheDocument();
  expect(screen.queryByLabelText("테스트 경로 지도")).not.toBeInTheDocument();
});

test("keeps the input-only loading workspace visible without a map", async () => {
  let resolveCandidates;
  const pendingCandidates = new Promise((resolve) => { resolveCandidates = resolve; });
  const services = createServices({ fetchRouteCandidates: jest.fn().mockReturnValue(pendingCandidates) });
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);

  fireEvent.click(await screen.findByRole("button", { name: "도착할 때 빌릴 곳 찾기" }));
  expect(screen.getByRole("button", { name: "도착 시점 후보를 찾는 중…" })).toBeDisabled();
  expect(screen.queryByLabelText("테스트 경로 지도")).not.toBeInTheDocument();

  resolveCandidates({ candidates });
  expect(await screen.findByRole("heading", { name: "추천 대여소" })).toBeInTheDocument();
});

test("renders empty and partial states without fabricating unavailable values", async () => {
  const emptyServices = createServices({ fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates: [] }) });
  const { unmount } = render(<ConsumerMainPage services={emptyServices} mapRenderer={PreviewMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "도착할 때 빌릴 곳 찾기" }));
  expect(await screen.findByRole("heading", { name: "조건에 맞는 대여소를 찾지 못했습니다" })).toBeInTheDocument();
  unmount();

  const unavailable = { ...candidates[1], stationId: "ST-3", stationName: "경로 확인 대기", predictionProbability: null, predictionStatus: "UNAVAILABLE", availabilityLevel: null, routeStatus: "UNAVAILABLE", routeDetail: null, distanceMeters: 0, durationSeconds: 0, arrivalAt: null };
  const partialServices = createServices({ fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates: [candidates[0], unavailable] }) });
  render(<ConsumerMainPage services={partialServices} mapRenderer={PreviewMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "도착할 때 빌릴 곳 찾기" }));

  expect(await screen.findByRole("heading", { name: "일부 후보의 근거를 확인하지 못했습니다" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /경로 확인 대기/ })).toHaveTextContent("확인 불가");
  expect(screen.getByRole("button", { name: /경로 확인 대기/ })).toHaveTextContent("시간 확인 불가");
  expect(screen.getByRole("button", { name: /경로 확인 대기/ })).not.toHaveTextContent("0m");
});

test("shows normal zero inventory separately from missing inventory metadata", async () => {
  const normalZero = { ...candidates[0], availableBikeCount: 0, inventoryStatus: "NORMAL", inventoryCollectedAt: "2026-09-02T09:00:00+09:00", predictionTargetAt: "2026-09-02T10:00:00+09:00", horizonMinutes: 60, featureAsOf: "2026-09-02T08:55:00+09:00", expiresAt: "2026-09-02T10:05:00+09:00" };
  const missing = { ...candidates[1], availableBikeCount: null, inventoryStatus: "MISSING", inventoryCollectedAt: null };
  const services = createServices({ fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates: [normalZero, missing] }) });
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "도착할 때 빌릴 곳 찾기" }));

  expect(await screen.findAllByText(/현재 0대 · 정상/)).not.toHaveLength(0);
  expect(screen.getByRole("button", { name: /뚝섬역 1번 출구/ })).toHaveTextContent("현재 재고 확인 불가 · MISSING");
  expect(screen.getByText(/horizon 60분/)).toBeInTheDocument();
});

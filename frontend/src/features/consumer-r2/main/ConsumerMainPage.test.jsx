import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConsumerMainPage from "./ConsumerMainPage.jsx";

const places = {
  origin: { providerId: "origin-place", name: "서울역", latitude: 37.5547, longitude: 126.9707 },
  destination: { providerId: "destination-place", name: "서울숲", latitude: 37.5444, longitude: 127.0374 },
};

const currentUser = { id: "user-1", displayName: "김따릉" };
const searchInput = {
  origin: { providerId: "origin-place", displayName: "서울역", latitude: 37.5547, longitude: 126.9707 },
  destination: { providerId: "destination-place", displayName: "서울숲", latitude: 37.5444, longitude: 127.0374 },
  travelMode: "PUBLIC_TRANSIT",
  requiredBikeCount: 1,
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
    getCurrentUser: jest.fn().mockResolvedValue({ authenticated: true, user: currentUser }),
    loadPendingPrediction: jest.fn().mockReturnValue({ travelMode: "PUBLIC_TRANSIT", requiredBikeCount: 1, routePlaces: places }),
    savePendingPrediction: jest.fn(),
    saveRecentSearch: jest.fn(),
    createSearchRecheck: jest.fn().mockResolvedValue({ publicId: "recheck-1" }),
    searchPlaces: jest.fn(),
    ...overrides,
  };
}

function PreviewMap({ routeDetail: detail }) {
  return <div aria-label="테스트 경로 지도">경로 {detail.distanceMeters}m</div>;
}

test("shows only the input workspace before a result and restores completed place selections", async () => {
  const { container } = render(<ConsumerMainPage services={createServices()} mapRenderer={PreviewMap} />);

  expect(await screen.findByRole("heading", { name: /도착할 때 빌릴 수 있는/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "대여 가능성 비교 조건" })).toBeInTheDocument();
  expect(screen.getByText("어디에서 출발하나요?")).toBeInTheDocument();
  expect(screen.getByText("어디 근처에서 빌리고 싶나요?")).toBeInTheDocument();
  expect(screen.getByText("몇 대가 필요한가요?")).toBeInTheDocument();
  expect(screen.getByText("서울역")).toBeInTheDocument();
  expect(screen.getByText("서울숲")).toBeInTheDocument();
  expect(container.querySelector("img.cr293-walk-illustration")).toHaveAttribute("alt", "");
  expect(screen.queryByLabelText("테스트 경로 지도")).not.toBeInTheDocument();
  expect(screen.queryByText("추천 대여소")).not.toBeInTheDocument();
});

test("global RIDING arrives as a usable INITIAL search instead of a guidance banner", async () => {
  const services = createServices({ loadPendingPrediction: jest.fn(() => null) });
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);
  await screen.findByRole("heading", { name: /도착할 때 빌릴 수 있는/ });

  // The old contract parked the user on a "pick a station first" banner; RIDING now just starts a search.
  expect(screen.queryByText("라이딩을 보려면 먼저 대여소를 선택해 주세요.")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "어디에서 출발하나요?" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "3대" })).toBeInTheDocument();
});

test("the INITIAL search lets the rider pick any of 1~5 bikes", async () => {
  render(<ConsumerMainPage services={createServices()} mapRenderer={PreviewMap} />);
  await screen.findByRole("heading", { name: /도착할 때 빌릴 수 있는/ });

  for (const count of [1, 2, 3, 4, 5]) {
    const option = screen.getByRole("button", { name: `${count}대` });
    fireEvent.click(option);
    expect(option).toHaveAttribute("aria-pressed", "true");
  }
});

test("Prediction main marks 라이딩 active, not 홈", async () => {
  render(<ConsumerMainPage services={createServices()} mapRenderer={PreviewMap} />);
  await screen.findByRole("heading", { name: /도착할 때 빌릴 수 있는/ });
  expect(screen.getByRole("button", { name: "라이딩" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
});

test("uses the route response once and changes candidate/detail views without refetching", async () => {
  const services = createServices();
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);

  fireEvent.click(await screen.findByRole("button", { name: "대여 가능성 비교" }));
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

  await waitFor(() => expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 비교" }));

  expect(services.savePendingPrediction).toHaveBeenCalledWith(expect.objectContaining({ requiredBikeCount: 1 }), places);
  expect(onLogin).toHaveBeenCalledTimes(1);
  expect(services.fetchRouteCandidates).not.toHaveBeenCalled();
});

test("separates a route fetch error from the map runtime", async () => {
  const services = createServices({ fetchRouteCandidates: jest.fn().mockRejectedValue(new Error("CANDIDATE_FETCH_FAILED")) });
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);

  fireEvent.click(await screen.findByRole("button", { name: "대여 가능성 비교" }));
  expect(await screen.findByRole("heading", { name: "추천 결과를 불러오지 못했습니다" })).toBeInTheDocument();
  expect(screen.queryByLabelText("테스트 경로 지도")).not.toBeInTheDocument();
});

test("keeps the input-only loading workspace visible without a map", async () => {
  let resolveCandidates;
  const pendingCandidates = new Promise((resolve) => { resolveCandidates = resolve; });
  const services = createServices({ fetchRouteCandidates: jest.fn().mockReturnValue(pendingCandidates) });
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);

  fireEvent.click(await screen.findByRole("button", { name: "대여 가능성 비교" }));
  expect(screen.getByRole("button", { name: "도착 시점 후보를 찾는 중…" })).toBeDisabled();
  expect(screen.queryByLabelText("테스트 경로 지도")).not.toBeInTheDocument();

  resolveCandidates({ candidates });
  expect(await screen.findByRole("heading", { name: "추천 대여소" })).toBeInTheDocument();
});

test("renders empty and partial states without fabricating unavailable values", async () => {
  const emptyServices = createServices({ fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates: [] }) });
  const { unmount } = render(<ConsumerMainPage services={emptyServices} mapRenderer={PreviewMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "대여 가능성 비교" }));
  expect(await screen.findByRole("heading", { name: "조건에 맞는 대여소를 찾지 못했습니다" })).toBeInTheDocument();
  unmount();

  const unavailable = { ...candidates[1], stationId: "ST-3", stationName: "경로 확인 대기", predictionProbability: null, predictionStatus: "UNAVAILABLE", availabilityLevel: null, routeStatus: "UNAVAILABLE", routeDetail: null, distanceMeters: 0, durationSeconds: 0, arrivalAt: null };
  const partialServices = createServices({ fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates: [candidates[0], unavailable] }) });
  render(<ConsumerMainPage services={partialServices} mapRenderer={PreviewMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "대여 가능성 비교" }));

  expect(await screen.findByRole("heading", { name: "일부 후보의 근거를 확인하지 못했습니다" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /경로 확인 대기/ })).toHaveTextContent("확인 불가");
  expect(screen.getByRole("button", { name: /경로 확인 대기/ })).toHaveTextContent("시간 확인 불가");
  expect(screen.getByRole("button", { name: /경로 확인 대기/ })).not.toHaveTextContent("0m");
});

test("does not claim a computed probability when transit prediction and steps are missing", async () => {
  const candidate = { ...candidates[0], predictionProbability: null, predictionStatus: "MISSING", availabilityLevel: null, routeDetail: { ...routeDetail, steps: [] } };
  render(<ConsumerMainPage services={createServices({ fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates: [candidate] }) })} mapRenderer={PreviewMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "대여 가능성 비교" }));
  fireEvent.click(await screen.findByRole("button", { name: "대중교통 경로 상세" }));
  expect(screen.getByText(/대여 가능성은 현재 확인하지 못했습니다/)).toBeInTheDocument();
  expect(screen.queryByText(/대여 가능성은.*계산했습니다/)).not.toBeInTheDocument();
  expect(screen.getByText(/상세 이동 단계가 제공되지 않았습니다/)).toHaveAttribute("role", "status");
});

test("shows normal zero inventory separately from missing inventory metadata", async () => {
  const normalZero = { ...candidates[0], availableBikeCount: 0, inventoryStatus: "NORMAL", inventoryCollectedAt: "2026-09-02T09:00:00+09:00", predictionTargetAt: "2026-09-02T10:00:00+09:00", horizonMinutes: 60, featureAsOf: "2026-09-02T08:55:00+09:00", expiresAt: "2026-09-02T10:05:00+09:00" };
  const missing = { ...candidates[1], availableBikeCount: null, inventoryStatus: "MISSING", inventoryCollectedAt: null };
  const services = createServices({ fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates: [normalZero, missing] }) });
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);
  fireEvent.click(await screen.findByRole("button", { name: "대여 가능성 비교" }));

  expect(await screen.findAllByText(/현재 0대 · 정상/)).not.toHaveLength(0);
  expect(screen.getByRole("button", { name: /뚝섬역 1번 출구/ })).toHaveTextContent("현재 재고 확인 불가 · MISSING");
  expect(screen.getByText(/horizon 60분/)).toBeInTheDocument();
});

test.each([
  ["DELAYED", "현재 5대 · 지연 데이터", true],
  ["MISSING", "현재 재고 확인 불가 · MISSING", false],
])("preserves %s inventory semantics in transit detail", async (inventoryStatus, expectedInventory, hasAsOf) => {
  const candidate = {
    ...candidates[0],
    availableBikeCount: 5,
    inventoryStatus,
    inventoryCollectedAt: "2026-09-02T09:00:00+09:00",
  };
  const services = createServices({ fetchRouteCandidates: jest.fn().mockResolvedValue({ candidates: [candidate] }) });
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);

  fireEvent.click(await screen.findByRole("button", { name: "대여 가능성 비교" }));
  fireEvent.click(await screen.findByRole("button", { name: "대중교통 경로 상세" }));

  const inventory = screen.getByLabelText(new RegExp(expectedInventory));
  expect(inventory).toHaveTextContent(inventoryStatus === "MISSING" ? "확인 불가" : "5대");
  expect(inventory).toHaveTextContent(inventoryStatus === "MISSING" ? "MISSING" : "지연 데이터");
  if (hasAsOf) expect(inventory).toHaveTextContent(/\d{1,2}\. \d{1,2}\. \d{2}:00 기준/);
});

test("treats an anonymous 200 auth envelope as anonymous and preserves inputs before login", async () => {
  const onLogin = jest.fn();
  const services = createServices({ getCurrentUser: jest.fn().mockResolvedValue({ authenticated: false, user: null }) });
  render(<ConsumerMainPage services={services} onLogin={onLogin} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 비교" }));

  expect(onLogin).toHaveBeenCalledTimes(1);
  expect(services.savePendingPrediction).toHaveBeenCalledWith(expect.objectContaining({ origin: "서울역", requiredBikeCount: 1 }), places);
  expect(services.fetchRouteCandidates).not.toHaveBeenCalled();
  expect(services.saveRecentSearch).not.toHaveBeenCalled();
});

test("keeps auth failures separate from anonymous state and retries session lookup without discarding inputs", async () => {
  const onLogin = jest.fn();
  const services = createServices({ getCurrentUser: jest.fn()
    .mockRejectedValueOnce({ status: 503 })
    .mockResolvedValueOnce({ authenticated: true, user: currentUser }) });
  render(<ConsumerMainPage services={services} onLogin={onLogin} />);

  expect(await screen.findByRole("heading", { name: "로그인 상태를 확인하지 못했습니다" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeDisabled();
  expect(onLogin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "로그인 상태 다시 확인" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled());
  expect(screen.getByText("김따릉")).toBeInTheDocument();
  expect(screen.getByText("서울역")).toBeInTheDocument();
});

test("restores a recent search as inputs only and records only those conditions after successful comparison", async () => {
  const services = createServices({ loadPendingPrediction: jest.fn(() => null) });
  render(<ConsumerMainPage restoreSearch={searchInput} services={services} mapRenderer={PreviewMap} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled());
  expect(services.fetchRouteCandidates).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("테스트 경로 지도")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 비교" }));
  await screen.findByRole("heading", { name: "추천 대여소" });
  expect(services.saveRecentSearch).toHaveBeenCalledWith(currentUser, searchInput);
  expect(services.createSearchRecheck).not.toHaveBeenCalled();
});

test("renders a supplied fresh Alerts result with its matching restored inputs without another prediction call", async () => {
  const services = createServices();
  render(<ConsumerMainPage restoreSearch={searchInput} currentResult={{ candidates }} services={services} mapRenderer={PreviewMap} />);
  expect(await screen.findByRole("heading", { name: "추천 대여소" })).toBeInTheDocument();
  expect(await screen.findByText("김따릉")).toBeInTheDocument();
  expect(screen.getByLabelText("선택 조건")).toHaveTextContent("서울역 → 서울숲");
  expect(services.fetchRouteCandidates).not.toHaveBeenCalled();
});

test.each([undefined, { ...searchInput, requiredBikeCount: 0 }])("does not render supplied evidence without matching complete restore inputs", async (restoreSearch) => {
  const services = createServices({ loadPendingPrediction: jest.fn(() => null) });
  render(<ConsumerMainPage currentResult={{ candidates }} restoreSearch={restoreSearch} services={services} mapRenderer={PreviewMap} />);
  await screen.findByText("김따릉");
  expect(screen.queryByRole("heading", { name: "추천 대여소" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("테스트 경로 지도")).not.toBeInTheDocument();
});

test("drops a previous in-flight comparison when another search is restored", async () => {
  let resolveCandidates;
  const services = createServices({ fetchRouteCandidates: jest.fn(() => new Promise((resolve) => { resolveCandidates = resolve; })) });
  const { rerender } = render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 비교" }));
  rerender(<ConsumerMainPage services={services} restoreSearch={{ ...searchInput, requiredBikeCount: 4 }} mapRenderer={PreviewMap} />);
  resolveCandidates({ candidates });
  await waitFor(() => expect(screen.getByRole("button", { name: "4대" })).toHaveAttribute("aria-pressed", "true"));
  expect(screen.queryByRole("heading", { name: "추천 대여소" })).not.toBeInTheDocument();
  expect(services.saveRecentSearch).not.toHaveBeenCalled();
});

test("passes the selected candidate and current input conditions to destination routes", async () => {
  const onOpenRide = jest.fn();
  const onOpenStation = jest.fn();
  render(<ConsumerMainPage services={createServices()} mapRenderer={PreviewMap} onOpenRide={onOpenRide} onOpenStation={onOpenStation} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 비교" }));
  fireEvent.click(await screen.findByRole("button", { name: "라이딩 둘러보기" }));
  fireEvent.click(screen.getByRole("button", { name: "대여소 상세" }));
  expect(onOpenRide).toHaveBeenCalledWith(expect.objectContaining({ stationId: "ST-1", probability: 0.91 }), searchInput);
  expect(onOpenStation).toHaveBeenCalledWith(expect.objectContaining({ stationId: "ST-1" }), searchInput);
});

test("creates a search recheck only after the user confirms an explicit departure time", async () => {
  const services = createServices();
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 비교" }));
  fireEvent.click(await screen.findByRole("button", { name: "출발 전에 다시 알려주세요" }));
  expect(services.createSearchRecheck).not.toHaveBeenCalled();
  const departureAt = "2099-09-03T18:30";
  fireEvent.change(screen.getByLabelText(/출발 시각/), { target: { value: departureAt } });
  fireEvent.click(screen.getByRole("button", { name: "15분 전 알림 받기" }));
  expect(await screen.findByText("출발 15분 전 재확인 알림을 신청했습니다.")).toBeInTheDocument();
  expect(services.createSearchRecheck).toHaveBeenCalledWith(searchInput, new Date(departureAt).toISOString());
});

test("keeps comparison results when optional recent-search storage or recheck creation fails", async () => {
  const services = createServices({
    saveRecentSearch: jest.fn(() => { throw new Error("STORAGE_UNAVAILABLE"); }),
    createSearchRecheck: jest.fn().mockRejectedValue({ status: 503 }),
  });
  render(<ConsumerMainPage services={services} mapRenderer={PreviewMap} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 비교" }));
  expect(await screen.findByRole("heading", { name: "추천 대여소" })).toBeInTheDocument();
  expect(screen.getByText("비교 결과는 확인했지만 최근 검색을 저장하지 못했습니다.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "출발 전에 다시 알려주세요" }));
  fireEvent.change(screen.getByLabelText(/출발 시각/), { target: { value: "2099-09-03T18:30" } });
  fireEvent.click(screen.getByRole("button", { name: "15분 전 알림 받기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("재확인 알림을 신청하지 못했습니다.");
  expect(screen.getByRole("heading", { name: "추천 대여소" })).toBeInTheDocument();
});

test("reports restored and edited inputs with partial query text and actual provider selections", async () => {
  const onInputChange = jest.fn();
  const onSearchComplete = jest.fn();
  const origin = { placeId: "new-provider-origin", name: "새 출발 장소", latitude: 37.55, longitude: 127.01 };
  const services = createServices({ searchPlaces: jest.fn().mockResolvedValue({ places: [origin] }) });
  const restored = { ...searchInput, origin: "검색 중인 출발 장소" };
  render(<ConsumerMainPage restoreSearch={restored} services={services} onInputChange={onInputChange} onSearchComplete={onSearchComplete} />);

  await waitFor(() => expect(onInputChange).toHaveBeenCalledWith(restored));
  expect(onSearchComplete).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "어디에서 출발하나요?" }), { target: { value: "새 출발" } });
  expect(onInputChange).toHaveBeenLastCalledWith({ ...restored, origin: "새 출발" });
  expect(onSearchComplete).toHaveBeenLastCalledWith({ ...restored, origin: "새 출발" }, null);

  fireEvent.click(await screen.findByRole("button", { name: /새 출발 장소/ }));
  const selected = { ...restored, origin: { providerId: origin.placeId, displayName: origin.name, latitude: origin.latitude, longitude: origin.longitude } };
  expect(onInputChange).toHaveBeenLastCalledWith(selected);
  expect(onSearchComplete).toHaveBeenLastCalledWith(selected, null);
  expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "도보" }));
  fireEvent.click(screen.getByRole("button", { name: "3대" }));
  expect(onInputChange).toHaveBeenLastCalledWith({ ...selected, travelMode: "WALK", requiredBikeCount: 3 });
  expect(onSearchComplete).toHaveBeenLastCalledWith({ ...selected, travelMode: "WALK", requiredBikeCount: 3 }, null);
  expect(services.fetchRouteCandidates).not.toHaveBeenCalled();
});

test("reports the exact successful response once and invalidates it when resetting conditions", async () => {
  const response = { candidates, sourceStatus: "NORMAL" };
  const onInputChange = jest.fn();
  const onSearchComplete = jest.fn();
  const services = createServices({ fetchRouteCandidates: jest.fn().mockResolvedValue(response) });
  const { rerender } = render(<ConsumerMainPage restoreSearch={searchInput} services={services} mapRenderer={PreviewMap} onInputChange={onInputChange} onSearchComplete={onSearchComplete} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대여 가능성 비교" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대여 가능성 비교" }));
  await screen.findByRole("heading", { name: "추천 대여소" });
  expect(onSearchComplete).toHaveBeenCalledTimes(1);
  expect(onSearchComplete).toHaveBeenCalledWith(searchInput, response);
  expect(onSearchComplete.mock.calls[0][1]).toBe(response);

  const replacementInputCallback = jest.fn();
  const replacementResultCallback = jest.fn();
  rerender(<ConsumerMainPage restoreSearch={searchInput} services={services} mapRenderer={PreviewMap} onInputChange={replacementInputCallback} onSearchComplete={replacementResultCallback} />);
  expect(screen.getByRole("heading", { name: "추천 대여소" })).toBeInTheDocument();
  expect(replacementInputCallback).not.toHaveBeenCalled();
  expect(replacementResultCallback).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "조건 다시 선택" }));
  expect(replacementResultCallback).toHaveBeenCalledWith(searchInput, null);
  expect(screen.queryByRole("heading", { name: "추천 대여소" })).not.toBeInTheDocument();
});

test("reports restored conditions without re-emitting a supplied current result", async () => {
  const onInputChange = jest.fn();
  const onSearchComplete = jest.fn();
  render(<ConsumerMainPage restoreSearch={searchInput} currentResult={{ candidates }} services={createServices()} mapRenderer={PreviewMap} onInputChange={onInputChange} onSearchComplete={onSearchComplete} />);
  await screen.findByRole("heading", { name: "추천 대여소" });
  expect(onInputChange).toHaveBeenCalledTimes(1);
  expect(onInputChange).toHaveBeenCalledWith(searchInput);
  expect(onSearchComplete).not.toHaveBeenCalled();
});

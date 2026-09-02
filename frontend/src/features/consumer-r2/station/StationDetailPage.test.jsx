import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StationDetailPage from "./StationDetailPage";
import { loadKakaoMapSdk } from "../../map/kakaoMapApi";

jest.mock("../../map/kakaoMapApi", () => ({
  createKakaoMapAdapter: jest.fn(() => ({ setStations: jest.fn() })),
  loadKakaoMapSdk: jest.fn(() => Promise.reject(new Error("map unavailable"))),
}));

const baseStation = {
  stationId: "37-2",
  stationNumber: "1002",
  name: "서울역 2번 출구",
  latitude: 37.555,
  longitude: 126.97,
  availableBikeCount: 0,
  collectedAt: "2026-09-02T05:10:00Z",
  inventoryStatus: "NORMAL",
};

function detail(overrides = {}) {
  return {
    station: baseStation,
    rhythm: { weekdayHourly: Array.from({ length: 21 }, (_, index) => ({ dayOfWeek: Math.floor(index / 3) + 1, hourOfDay: index % 3 === 0 ? 8 : index % 3 === 1 ? 10 : 12, stockoutRate: index === 0 ? 0.3 : 0.1 })), stockout: { medianDurationMinutes: 12, medianRecoveryMinutesToThree: 8 } },
    rhythmState: "ready",
    nearby: [{ stationId: "37-3", name: "서울역 3번 출구" }],
    nearbyState: "ready",
    favorite: null,
    favoriteState: "ready",
    ...overrides,
  };
}

async function renderPage(overrides = {}) {
  const adapter = { load: jest.fn().mockResolvedValue(detail(overrides)), toggleFavorite: jest.fn().mockResolvedValue({ id: 4 }) };
  render(<StationDetailPage adapter={adapter} stationId="37-2" onNavigate={jest.fn()} />);
  await screen.findByRole("heading", { name: "서울역 2번 출구" });
  return adapter;
}

describe("StationDetailPage", () => {
  beforeEach(() => {
    loadKakaoMapSdk.mockRejectedValue(new Error("map unavailable"));
  });

  it("shows a normal station with a factual zero-bike count", async () => {
    await renderPage();
    expect(screen.getByText("0대")).toBeInTheDocument();
    expect(screen.getByText("정상")).toBeInTheDocument();
    expect(screen.getByText("12분")).toBeInTheDocument();
    expect(screen.getByTitle("월 8시 · 품절 관측률 30%")).toBeInTheDocument();
    expect(screen.getByText("월요일 8시 품절 관측률 30퍼센트")).toBeInTheDocument();
    expect(screen.getByText(/미래의 대여 가능 대수를 예측하지 않습니다/)).toBeInTheDocument();
  });

  it("does not turn missing inventory into a normal zero", async () => {
    await renderPage({ station: { ...baseStation, availableBikeCount: null, inventoryStatus: "MISSING" } });
    expect(screen.getAllByText("수집 누락")).toHaveLength(2);
    expect(screen.queryByText("0대")).not.toBeInTheDocument();
  });

  it("keeps a delayed zero count distinct from normal inventory", async () => {
    await renderPage({ station: { ...baseStation, inventoryStatus: "DELAYED" } });
    expect(screen.getByText("지연")).toBeInTheDocument();
    expect(screen.getByText("0대")).toBeInTheDocument();
  });

  it("keeps unavailable inventory distinct from a missing inventory value", async () => {
    await renderPage({ station: { ...baseStation, availableBikeCount: null, inventoryStatus: "UNAVAILABLE" } });
    expect(screen.getAllByText("조회 불가")).toHaveLength(2);
    expect(screen.queryByText("0대")).not.toBeInTheDocument();
  });

  it("keeps unavailable rhythm and nearby data visibly separate", async () => {
    await renderPage({ rhythm: null, rhythmState: "missing", nearby: [], nearbyState: "unavailable" });
    expect(screen.getAllByText(/아직 제공하지 않습니다/)).toHaveLength(3);
  });

  it("prepares only the ride route action", async () => {
    const onNavigate = jest.fn();
    const adapter = { load: jest.fn().mockResolvedValue(detail()), toggleFavorite: jest.fn() };
    render(<StationDetailPage adapter={adapter} stationId="37-2" onNavigate={onNavigate} />);
    await screen.findByRole("heading", { name: "서울역 2번 출구" });
    fireEvent.click(screen.getByRole("button", { name: /이 대여소에서 라이딩 보기/ }));
    expect(onNavigate).toHaveBeenCalledWith("ride", "37-2");
  });

  it("toggles a favorite without changing the station presentation", async () => {
    const adapter = await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "관심 등록" }));
    await waitFor(() => expect(adapter.toggleFavorite).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "서울역 2번 출구" })).toBeInTheDocument();
  });

  it("keeps a valid zero-minute rhythm observation", async () => {
    await renderPage({ rhythm: { ...detail().rhythm, stockout: { medianDurationMinutes: 0, medianRecoveryMinutesToThree: 0 } } });
    expect(screen.getAllByText("0분")).toHaveLength(2);
  });

  it("does not render an empty station presentation when the primary detail request fails", async () => {
    const adapter = { load: jest.fn().mockRejectedValue(new Error("STATION_API_ERROR")), toggleFavorite: jest.fn() };
    render(<StationDetailPage adapter={adapter} stationId="37-2" onNavigate={jest.fn()} />);
    expect(await screen.findByRole("heading", { name: "대여소 정보를 불러오지 못했습니다" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "서울역 2번 출구" })).not.toBeInTheDocument();
  });

  it("shows a favorite mutation failure without discarding loaded detail", async () => {
    const adapter = { load: jest.fn().mockResolvedValue(detail()), toggleFavorite: jest.fn().mockRejectedValue(new Error("ARCHIVE_ERROR")) };
    render(<StationDetailPage adapter={adapter} stationId="37-2" onNavigate={jest.fn()} />);
    await screen.findByRole("heading", { name: "서울역 2번 출구" });
    fireEvent.click(screen.getByRole("button", { name: "관심 등록" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("관심 대여소 변경에 실패했습니다.");
    expect(screen.getByRole("heading", { name: "서울역 2번 출구" })).toBeInTheDocument();
  });
});

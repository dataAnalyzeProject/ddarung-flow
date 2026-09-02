import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConsumerRidingGuidePage from "./ConsumerRidingGuidePage.jsx";

function guide(overrides = {}) {
  return {
    stationId: "ST-4",
    status: "NORMAL",
    aiStatus: "AVAILABLE",
    aiCode: null,
    warnings: [],
    factualPartial: false,
    facts: {
      rental: { status: "NORMAL", text: { stationName: "성수역 3번 출구", availabilityLevel: "HIGH", inventoryStatus: "NORMAL" }, numeric: { rentalProbability: 0.82, availableBikeCount: 7 } },
      weather: { status: "NORMAL", text: { skyStatus: "CLEAR" }, numeric: { temperatureCelsius: 25.3 } },
      airQuality: { status: "NORMAL", text: { khaiGrade: "GOOD" }, numeric: { pm25: 18 } },
      places: [{ id: "poi:1", status: "NORMAL", text: { name: "서울숲", category: "공원", address: "서울 성동구" }, numeric: { distanceMeters: 850 } }],
    },
    ai: {
      summary: "지금 출발하기 좋은 조건이에요.",
      rationale: "확인된 대여소와 장소를 함께 살폈습니다.",
      rationaleTags: ["EVIDENCE_BACKED"],
      itinerary: [{ poiId: "poi:1", name: "서울숲", category: "공원", address: "서울 성동구", distanceMeters: 850, stayMinutes: 30, rationale: "잠시 머무르기 좋습니다." }],
    },
    hasExistingPlan: false,
    scheduleCta: "AI로 전체 일정 만들기",
    ...overrides,
  };
}

function service(result) {
  return { load: jest.fn().mockResolvedValue(result) };
}

test("renders the NO PLAN guide with server facts and routes schedule creation to the planner", async () => {
  const services = service({ accessState: "ACTIVE", guide: guide() });
  const onNavigate = jest.fn();
  const { container } = render(<ConsumerRidingGuidePage stationId="ST-4" services={services} onNavigate={onNavigate} />);

  expect(await screen.findByRole("heading", { name: "Premium Riding Guide" })).toBeInTheDocument();
  expect(screen.getByText("82%")).toBeInTheDocument();
  expect(screen.getByText("7대")).toBeInTheDocument();
  expect(screen.getByText("정상 수집")).toBeInTheDocument();
  expect(screen.queryByText("NORMAL")).not.toBeInTheDocument();
  expect(screen.getByText("25.3°C")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "아직 전체 일정이 없습니다" })).toBeInTheDocument();
  expect(container.querySelector(".cr22-guide__schedule img")).toHaveAttribute("width", "1200");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /AI로 전체 일정 만들기/ }));
  expect(onNavigate).toHaveBeenCalledWith("planner");
  expect(services.load).toHaveBeenCalledWith(expect.objectContaining({ stationId: "ST-4", journeyDecisionId: null }));
});

test("renders only the short server itinerary for an existing plan and uses its CTA", async () => {
  const existing = guide({ hasExistingPlan: true, scheduleCta: "내 AI 일정 보기" });
  const services = service({ accessState: "ACTIVE", guide: existing });
  const onNavigate = jest.fn();
  render(<ConsumerRidingGuidePage stationId="ST-4" guideContext={{ journeyDecisionId: "JRN-1" }} services={services} onNavigate={onNavigate} />);

  expect(await screen.findByRole("heading", { name: "내 AI 일정" })).toBeInTheDocument();
  expect(screen.getByText("체류 30분")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /내 AI 일정 보기/ }));
  expect(onNavigate).toHaveBeenCalledWith("journey-result", "JRN-1");
});

test("keeps factual values visible while AI and unavailable facts stay explicit", async () => {
  const unavailable = guide({
    status: "PARTIAL",
    aiStatus: "UNAVAILABLE",
    aiCode: "AI_PROVIDER_UNAVAILABLE",
    factualPartial: true,
    facts: {
      ...guide().facts,
      weather: { status: "UNAVAILABLE", text: {}, numeric: {} },
    },
    ai: { summary: null, rationale: null, rationaleTags: [], itinerary: [] },
  });
  render(<ConsumerRidingGuidePage stationId="ST-4" services={service({ accessState: "ACTIVE", guide: unavailable })} onNavigate={jest.fn()} />);

  expect(await screen.findByRole("heading", { name: "AI 요약을 지금 제공할 수 없습니다" })).toBeInTheDocument();
  expect(screen.getByText("82%")).toBeInTheDocument();
  expect(screen.getByText("7대")).toBeInTheDocument();
  expect(screen.getAllByText("확인 불가").length).toBeGreaterThan(0);
  expect(screen.getByText(/일부 사실 정보를 확인하지 못했습니다/)).toBeInTheDocument();
  expect(screen.queryByText("지금 출발하기 좋은 조건이에요.")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "확인된 주변 장소" })).toBeInTheDocument();
  expect(screen.getByText("서울숲")).toBeInTheDocument();
  expect(screen.queryByText(/AI_PROVIDER_UNAVAILABLE/)).not.toBeInTheDocument();
});

test("does not relabel unselected factual POIs as AI recommendations", async () => {
  const noSelection = guide({ ai: { ...guide().ai, itinerary: [] } });
  render(<ConsumerRidingGuidePage stationId="ST-4" services={service({ accessState: "ACTIVE", guide: noSelection })} onNavigate={jest.fn()} />);

  expect(await screen.findByRole("heading", { name: "실제 장소 기반 AI 추천 이유" })).toBeInTheDocument();
  expect(screen.getByText("현재 확인된 주변 장소가 없습니다.")).toBeInTheDocument();
  expect(screen.queryByText("서울숲")).not.toBeInTheDocument();
});

test.each([
  ["FREE", "Premium 이용권이 필요합니다"],
  ["EXPIRED", "Premium 이용 기간이 만료되었습니다"],
])("shows the %s access gate without rendering guide facts", async (accessState, heading) => {
  const services = service({ accessState, guide: null });
  render(<ConsumerRidingGuidePage stationId="ST-4" services={services} onNavigate={jest.fn()} />);

  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.queryByText("82%")).not.toBeInTheDocument();
});

test("does not show a Premium account badge before ACTIVE is verified", async () => {
  const services = service({ accessState: "FREE", guide: null });
  const { container } = render(<ConsumerRidingGuidePage stationId="ST-4" user={{ displayName: "김따릉" }} services={services} onNavigate={jest.fn()} />);

  expect(await screen.findByRole("heading", { name: "Premium 이용권이 필요합니다" })).toBeInTheDocument();
  expect(container.querySelector(".cr22-header__account .cr22-header__premium")).not.toBeInTheDocument();
});

test("does not request the guide for an anonymous session", async () => {
  const services = service({ accessState: "ACTIVE", guide: guide() });
  render(<ConsumerRidingGuidePage authState="anonymous" stationId="ST-4" services={services} />);

  expect(screen.getByRole("heading", { name: "로그인이 필요합니다" })).toBeInTheDocument();
  await waitFor(() => expect(services.load).not.toHaveBeenCalled());
  expect(screen.getByRole("link", { name: "본문 바로가기" })).toHaveAttribute("href", "#main-content");
});

test("retries an initial load error and transitions to the loaded guide", async () => {
  const services = {
    load: jest.fn()
      .mockRejectedValueOnce(new Error("NETWORK_ERROR"))
      .mockResolvedValueOnce({ accessState: "ACTIVE", guide: guide() }),
  };
  render(<ConsumerRidingGuidePage stationId="ST-4" services={services} onNavigate={jest.fn()} />);

  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("이용 상태를 확인하지 못했습니다");
  expect(services.load).toHaveBeenCalledTimes(1);

  await act(async () => {
    userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await Promise.resolve();
  });

  await waitFor(() => expect(services.load).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("heading", { name: "Premium Riding Guide" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

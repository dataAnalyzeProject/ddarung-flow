import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConsumerJourneyPlannerPage from "./ConsumerJourneyPlannerPage";
import ConsumerJourneyPlanResultPage from "./ConsumerJourneyPlanResultPage";

const place = (placeId, displayName) => ({ placeId, displayName, latitude: 37.5, longitude: 127.0 });
const plannerContext = {
  origin: place("origin-context", "성수"),
  departureAt: "2030-09-03T01:00:00.000Z",
  maxJourneyMinutes: 120,
  requiredBikeCount: 1,
};

function decision(status = "READY") {
  return {
    decisionId: "decision-1",
    revision: 1,
    status,
    normalizedIntent: {
      origin: place("origin-1", "성수"), destination: place("destination-1", "서울숲"),
      departureAt: "2030-09-03T01:00:00.000Z", maxJourneyMinutes: 120, requiredBikeCount: 1,
      preferences: {}, avoid: [],
    },
    unifiedPlan: {
      status,
      rationale: "실제 대여소와 이동 경로 근거를 조합했습니다.",
      rationaleTags: ["EVIDENCE_ONLY"],
      segments: [
        { segmentId: "access-1", type: "ACCESS", fromEvidenceId: "origin-e", toEvidenceId: "rent-e", startAt: "2030-09-03T01:00:00.000Z", endAt: "2030-09-03T01:00:00.000Z", durationSeconds: 0, distanceMeters: 0, travelMode: "WALK", pathPoints: [{ latitude: 37.5, longitude: 127.0 }, { latitude: 37.51, longitude: 127.01 }] },
        { segmentId: "rent-1", type: "RENT", fromEvidenceId: "rent-e", toEvidenceId: "rent-e", startAt: "2030-09-03T01:00:00.000Z", rentalFacts: { stationName: "성수역 3번 출구", rentalProbability: 0, requiredBikeCount: 0, availableBikeCount: 0 } },
        { segmentId: "ride-1", type: "RIDE", fromEvidenceId: "rent-e", toEvidenceId: "poi-e", startAt: "2030-09-03T01:00:00.000Z", durationSeconds: 780, distanceMeters: 2800, travelMode: "BICYCLE", pathPoints: [{ latitude: 37.51, longitude: 127.01 }, { latitude: 37.52, longitude: 127.02 }] },
        { segmentId: "visit-1", type: "VISIT", fromEvidenceId: "poi-e", toEvidenceId: "poi-e", startAt: "2030-09-03T01:13:00.000Z", stayMinutes: 30, pathPoints: [] },
      ],
      evidence: {
        rentalCandidates: { "rent-e": { evidenceId: "rent-e", source: "rental-core", status: "NORMAL", textFacts: { stationName: "성수역 3번 출구" }, numericFacts: {} } },
        pois: { "poi-e": { evidenceId: "poi-e", source: "place-provider", status: "MISSING", textFacts: { displayName: "서울숲" }, numericFacts: {} } },
        routes: { "route:access:station-1": { evidenceId: "route:access:station-1", source: "route-provider", status: "UNAVAILABLE", textFacts: { fromEvidenceId: "origin-e", toEvidenceId: "rent-e" }, numericFacts: {} } },
        weather: {}, airQuality: {},
      },
    },
  };
}

test("planner exposes natural language as its only editable entry and confirms normalized intent", async () => {
  const adapter = { planNaturalLanguage: jest.fn().mockResolvedValue(decision()) };
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={plannerContext} />);
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toBeInTheDocument();
  expect(screen.queryByLabelText("필요한 자전거 수")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "성수에서 서울숲까지 달리고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(await screen.findByRole("heading", { name: /AI 조건 확인/ })).toBeInTheDocument();
  expect(screen.getByText("1대")).toBeInTheDocument();
  expect(adapter.planNaturalLanguage).toHaveBeenCalledWith("성수에서 서울숲까지 달리고 싶어요", expect.any(Object));
});

test("planner accepts at most one structured place clarification", async () => {
  const clarification = decision("CLARIFICATION_REQUIRED");
  clarification.normalizedIntent.destination = null;
  clarification.unifiedPlan = null;
  clarification.clarification = { question: "어느 목적지로 갈까요?", missingFields: ["destination"] };
  const adapter = {
    planNaturalLanguage: jest.fn().mockResolvedValue(clarification),
    searchPlaces: jest.fn().mockResolvedValue([place("destination-1", "서울숲")]),
    answerClarification: jest.fn().mockResolvedValue(decision()),
  };
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={plannerContext} />);
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "한강 쪽으로 달리고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(await screen.findByRole("heading", { name: /AI 추가 확인/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("목적 장소"), { target: { value: "서울" } });
  fireEvent.click(await screen.findByRole("button", { name: /서울숲/ }));
  fireEvent.click(screen.getByRole("button", { name: "선택하고 계속" }));
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole("heading", { name: /AI 조건 확인/ })).toBeInTheDocument();
});

test("planner answers a missing start time with a structured departureAt field", async () => {
  const clarification = decision("CLARIFICATION_REQUIRED");
  clarification.unifiedPlan = null;
  clarification.clarification = { question: "언제 출발할까요?", missingFields: ["startAt"] };
  const adapter = {
    planNaturalLanguage: jest.fn().mockResolvedValue(clarification),
    answerClarification: jest.fn().mockResolvedValue(decision()),
  };
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={plannerContext} />);
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "서울숲을 달리고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  fireEvent.change(await screen.findByLabelText("출발 희망 시각"), { target: { value: "2030-09-03T10:00" } });
  fireEvent.click(screen.getByRole("button", { name: "선택하고 계속" }));
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenCalledWith(clarification, { departureAt: "2030-09-03T10:00" }));
});

test("planner blocks an invalid network request when required upstream context is absent", async () => {
  const adapter = { planNaturalLanguage: jest.fn() };
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "서울숲을 달리고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("먼저 대여 예측에서 출발 위치");
  expect(adapter.planNaturalLanguage).not.toHaveBeenCalled();
});

test("planner locks clarification after the single structured answer is exhausted", async () => {
  const clarification = decision("CLARIFICATION_REQUIRED");
  clarification.normalizedIntent.destination = null;
  clarification.unifiedPlan = null;
  clarification.clarification = { question: "어느 목적지로 갈까요?", missingFields: ["destination"] };
  const adapter = {
    planNaturalLanguage: jest.fn().mockResolvedValue(clarification),
    searchPlaces: jest.fn().mockResolvedValue([place("destination-1", "서울숲")]),
    answerClarification: jest.fn().mockResolvedValue(clarification),
  };
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={plannerContext} />);
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "한강 쪽으로 달리고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  fireEvent.change(await screen.findByLabelText("목적 장소"), { target: { value: "서울" } });
  fireEvent.click(await screen.findByRole("button", { name: /서울숲/ }));
  fireEvent.click(screen.getByRole("button", { name: "선택하고 계속" }));
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenCalledTimes(1));
  await screen.findByRole("button", { name: "설명 다시 입력" });
  const continueButton = screen.getByRole("button", { name: "선택하고 계속" });
  expect(continueButton).toBeDisabled();
  fireEvent.click(continueButton);
  expect(adapter.answerClarification).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "설명 다시 입력" })).toBeInTheDocument();
});

test("result renders backend segments, zero values, pathPoints and evidence gaps without invented fallback", () => {
  render(<ConsumerJourneyPlanResultPage initialDecision={decision("PARTIAL")} />);
  expect(screen.getByRole("heading", { name: /성수 → 서울숲/ })).toBeInTheDocument();
  expect(screen.getAllByText("ACCESS").length).toBeGreaterThan(0);
  expect(screen.getAllByText("RENT").length).toBeGreaterThan(0);
  expect(screen.getAllByText("RIDE").length).toBeGreaterThan(0);
  expect(screen.getAllByText("VISIT").length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: "성수 → 성수역 3번 출구" })).toBeInTheDocument();
  expect(screen.getByText("시간 0분")).toBeInTheDocument();
  expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
  expect(screen.getByRole("img", { name: /실제 좌표/ })).toBeInTheDocument();
  expect(screen.getByText("MISSING")).toBeInTheDocument();
  expect(screen.getByText("UNAVAILABLE")).toBeInTheDocument();
  expect(screen.getByText(/rent-e · rentalCandidates · 구간 endpoint 참조/)).toBeInTheDocument();
  expect(screen.getByText(/route:access:station-1 · routes · 근거 번들/)).toBeInTheDocument();
});

test("result preserves factual backend segments when the unified plan is unavailable", () => {
  const unavailable = decision("UNAVAILABLE");
  unavailable.unifiedPlan.segments = unavailable.unifiedPlan.segments.slice(0, 2);
  render(<ConsumerJourneyPlanResultPage initialDecision={unavailable} />);
  expect(screen.getByRole("status")).toHaveTextContent("UNAVAILABLE");
  expect(screen.getAllByText("ACCESS").length).toBeGreaterThan(0);
  expect(screen.getAllByText("RENT").length).toBeGreaterThan(0);
  expect(screen.getByText(/근거 ID: origin-e → rent-e/)).toBeInTheDocument();
});

test("result keeps structured replan and current-condition save as separate actions", async () => {
  const current = decision();
  const adapter = { replan: jest.fn().mockResolvedValue(current), saveCurrentConditions: jest.fn().mockResolvedValue({ savedJourneyId: "saved-1" }) };
  render(<ConsumerJourneyPlanResultPage adapter={adapter} initialDecision={current} />);
  fireEvent.change(screen.getByLabelText("이용 시간"), { target: { value: "90" } });
  fireEvent.click(screen.getByLabelText("공원"));
  fireEvent.click(screen.getByLabelText("한강·하천"));
  fireEvent.change(screen.getByLabelText("방문 장소 수"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("경로 방식"), { target: { value: "SHORTEST" } });
  fireEvent.click(screen.getByRole("button", { name: "현재 근거로 다시 계획" }));
  await waitFor(() => expect(adapter.replan).toHaveBeenCalledWith(current, { constraints: { availableMinutes: 90, themes: ["PARK", "RIVER"], stopCount: 2, routeMode: "SHORTEST" } }));
  fireEvent.click(screen.getByRole("button", { name: "이 계획 저장" }));
  await waitFor(() => expect(adapter.saveCurrentConditions).toHaveBeenCalledWith(current));
  expect(await screen.findByText(/다시 열 때는 최신 근거/)).toBeInTheDocument();
});

test.each([
  ["PREMIUM_REQUIRED", "Premium 활성 계정"],
  ["PREMIUM_ENTITLEMENT_UNAVAILABLE", "Premium 상태를 지금 확인"],
])("planner exposes server premium gate %s", async (code, copy) => {
  const adapter = { planNaturalLanguage: jest.fn().mockRejectedValue({ code }) };
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={plannerContext} />);
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "서울숲으로 달리고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(copy);
});

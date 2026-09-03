import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConsumerJourneyPlannerPage from "./ConsumerJourneyPlannerPage";
import ConsumerJourneyPlanResultPage from "./ConsumerJourneyPlanResultPage";

jest.mock("./ConsumerJourneyMap", () => function JourneyMap() { return <section aria-label="실제 여정 경로 지도" />; });

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

test("planner preserves the sole AI free-text entry and confirms normalized intent with explicit context", async () => {
  const adapter = { planNaturalLanguage: jest.fn().mockResolvedValue(decision()) };
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={plannerContext} />);
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toBeInTheDocument();
  expect(screen.getByLabelText(/필요한 자전거 수/)).toHaveValue("1");
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "새 알림 보기" })).not.toBeInTheDocument();
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

test("expired session preserves the draft and offers an explicit login action", async () => {
  const adapter = { planNaturalLanguage: jest.fn().mockRejectedValue({ status: 401, code: "AUTH_REQUIRED" }) };
  const onLogin = jest.fn();
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={plannerContext} onLogin={onLogin} />);
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "서울숲 라이딩" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("로그인 세션이 만료");
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toHaveValue("서울숲 라이딩");
  expect(onLogin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "다시 로그인" }));
  expect(onLogin).toHaveBeenCalledTimes(1);
});

test("direct planner entry leaves required choices empty and blocks unselected context", async () => {
  const adapter = { planNaturalLanguage: jest.fn() };
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  expect(screen.getByLabelText(/출발 희망 시각/)).toHaveValue("");
  expect(screen.getByLabelText(/라이딩 이용 시간/)).toHaveValue(null);
  expect(screen.getByLabelText(/필요한 자전거 수/)).toHaveValue("");
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "서울숲을 달리고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("출발 장소를 검색 결과에서 선택");
  expect(screen.getByText("입력하기").closest("li")).toHaveAttribute("aria-current", "step");
  expect(adapter.planNaturalLanguage).not.toHaveBeenCalled();
});

test("direct planner entry resolves a provider origin and submits only user-selected structured values", async () => {
  const origin = place("provider-origin", "서울역");
  const adapter = { searchPlaces: jest.fn().mockResolvedValue([origin]), planNaturalLanguage: jest.fn().mockResolvedValue(decision()) };
  const onInputChange = jest.fn();
  render(<ConsumerJourneyPlannerPage adapter={adapter} onInputChange={onInputChange} />);
  fireEvent.change(screen.getByLabelText(/출발 장소/), { target: { value: "서울" } });
  fireEvent.click(await screen.findByRole("button", { name: /서울역/ }));
  fireEvent.change(screen.getByLabelText(/출발 희망 시각/), { target: { value: "2030-09-03T10:00" } });
  fireEvent.change(screen.getByLabelText(/라이딩 이용 시간/), { target: { value: "90" } });
  fireEvent.change(screen.getByLabelText(/필요한 자전거 수/), { target: { value: "2" } });
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "공원에서 쉬고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  await waitFor(() => expect(adapter.planNaturalLanguage).toHaveBeenCalledWith("공원에서 쉬고 싶어요", {
    origin, departureAt: "2030-09-03T10:00", maxJourneyMinutes: 90, requiredBikeCount: 2,
  }));
  expect(adapter.searchPlaces).toHaveBeenCalledWith("서울");
  expect(onInputChange).toHaveBeenLastCalledWith(expect.objectContaining({ origin, requiredBikeCount: 2 }));
});

test("planner invalidates a selected origin before replacing it and rejects stale search results", async () => {
  let resolveFirst;
  const adapter = {
    searchPlaces: jest.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValue([place("new-origin", "서울숲")]),
    planNaturalLanguage: jest.fn(),
  };
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={plannerContext} />);
  fireEvent.click(screen.getByRole("button", { name: "다시 선택" }));
  await waitFor(() => expect(adapter.searchPlaces).toHaveBeenCalledWith("성수"));
  fireEvent.change(screen.getByLabelText(/출발 장소/), { target: { value: "서울숲" } });
  expect(await screen.findByRole("button", { name: /서울숲/ })).toBeInTheDocument();
  await act(async () => resolveFirst([place("old-origin", "이전 검색") ]));
  expect(screen.queryByRole("button", { name: /이전 검색/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "공원을 달려요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
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
  expect(screen.getByRole("region", { name: "실제 여정 경로 지도" })).toBeInTheDocument();
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
  await waitFor(() => expect(screen.getByRole("button", { name: "이 계획 저장" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "이 계획 저장" }));
  await waitFor(() => expect(adapter.saveCurrentConditions).toHaveBeenCalledWith(current));
  expect(await screen.findByText(/다시 열 때는 최신 근거/)).toBeInTheDocument();
});

test("saved plan recheck requires an explicit opt-in and sends the returned saved ID with the chosen departure", async () => {
  const saved = { savedJourneyId: "saved-current", displayName: "현재 계획" };
  const adapter = { saveCurrentConditions: jest.fn().mockResolvedValue(saved) };
  const recheckAdapter = { createPlanRecheck: jest.fn().mockResolvedValue({ publicId: "recheck-current", status: "ACTIVE" }) };
  const onSaved = jest.fn();
  render(<ConsumerJourneyPlanResultPage adapter={adapter} initialDecision={decision()} now={() => new Date("2030-09-03T00:00:00Z")} onSaved={onSaved} recheckAdapter={recheckAdapter} />);
  expect(screen.queryByRole("button", { name: "출발 전에 다시 알려주세요" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "새 알림 보기" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 계획 저장" }));
  fireEvent.click(await screen.findByRole("button", { name: "출발 전에 다시 알려주세요" }));
  expect(onSaved).toHaveBeenCalledWith(saved);
  expect(recheckAdapter.createPlanRecheck).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/출발 시각/), { target: { value: "2030-09-03T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: "15분 전 알림 받기" }));
  await waitFor(() => expect(recheckAdapter.createPlanRecheck).toHaveBeenCalledWith("saved-current", new Date("2030-09-03T12:00").toISOString()));
  expect(await screen.findByText(/15분 전 재확인 알림을 신청/)).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("result switches decisions without letting an earlier request replace the current route", async () => {
  let resolveFirst;
  const next = { ...decision(), decisionId: "decision-2" };
  next.normalizedIntent = { ...next.normalizedIntent, origin: place("second", "서울역") };
  const adapter = { loadDecision: jest.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValue(next) };
  const onResult = jest.fn();
  const { rerender } = render(<ConsumerJourneyPlanResultPage adapter={adapter} decisionId="decision-1" onResult={onResult} />);
  expect(onResult).not.toHaveBeenCalled();
  rerender(<ConsumerJourneyPlanResultPage adapter={adapter} decisionId="decision-2" onResult={onResult} />);
  expect(await screen.findByRole("heading", { name: /서울역 → 서울숲/ })).toBeInTheDocument();
  await act(async () => resolveFirst(decision()));
  expect(screen.getByRole("heading", { name: /서울역 → 서울숲/ })).toBeInTheDocument();
  expect(onResult).toHaveBeenCalledTimes(1);
  expect(onResult).toHaveBeenCalledWith(next);
});

test("result reports original initial and replanned decisions with provider origin and selected station intact", async () => {
  const current = decision();
  current.candidates = [{ candidateId: "candidate-1", stationId: "ST-100", stationName: "선택 대여소", requiredBikeCount: 2, arrivalAt: "2030-09-03T01:20:00Z" }];
  current.unifiedPlan.selectedRentalCandidateId = "rental:ST-100";
  current.unifiedPlan.segments.find((segment) => segment.type === "RENT").rentalFacts.stationId = "ST-100";
  const replanned = { ...current, revision: 2 };
  const adapter = { replan: jest.fn().mockResolvedValue(replanned) };
  const onResult = jest.fn();
  const { rerender } = render(<ConsumerJourneyPlanResultPage adapter={adapter} decisionId={current.decisionId} initialDecision={current} onResult={onResult} />);
  await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
  expect(onResult.mock.calls[0][0]).toBe(current);
  expect(onResult.mock.calls[0][0].normalizedIntent.origin).toEqual(place("origin-1", "성수"));
  expect(onResult.mock.calls[0][0].candidates[0].stationId).toBe("ST-100");
  expect(onResult.mock.calls[0][0].unifiedPlan.selectedRentalCandidateId).toBe("rental:ST-100");
  rerender(<ConsumerJourneyPlanResultPage adapter={adapter} decisionId={current.decisionId} initialDecision={current} onResult={onResult} />);
  expect(onResult).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "현재 근거로 다시 계획" }));
  await waitFor(() => expect(onResult).toHaveBeenCalledTimes(2));
  expect(onResult.mock.calls[1][0]).toBe(replanned);
});

test("result does not report an unrelated initial decision or a failed lookup", async () => {
  const onResult = jest.fn();
  const adapter = { loadDecision: jest.fn().mockRejectedValue({ status: 404 }) };
  render(<ConsumerJourneyPlanResultPage adapter={adapter} decisionId="missing-decision" initialDecision={decision()} onResult={onResult} />);
  expect(await screen.findByRole("heading", { name: "AI 계획을 찾을 수 없습니다" })).toBeInTheDocument();
  expect(onResult).not.toHaveBeenCalled();
});

test("result keeps a saved ID tied to its revision and prevents overlapping save and replan", async () => {
  let resolveSave;
  const current = decision();
  const adapter = {
    saveCurrentConditions: jest.fn().mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; })),
    replan: jest.fn().mockResolvedValue({ ...current, revision: 2 }),
  };
  render(<ConsumerJourneyPlanResultPage adapter={adapter} initialDecision={current} />);
  fireEvent.click(screen.getByRole("button", { name: "이 계획 저장" }));
  expect(screen.getByRole("button", { name: "현재 근거로 다시 계획" })).toBeDisabled();
  await act(async () => resolveSave({ savedJourneyId: "saved-revision-1" }));
  expect(screen.getByRole("button", { name: "출발 전에 다시 알려주세요" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "현재 근거로 다시 계획" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "출발 전에 다시 알려주세요" })).not.toBeInTheDocument());
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

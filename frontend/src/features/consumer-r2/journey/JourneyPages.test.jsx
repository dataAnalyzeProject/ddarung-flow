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
      segments: [
        { segmentId: "access-1", type: "ACCESS", fromEvidenceId: "origin-e", toEvidenceId: "rent-e", startAt: "2030-09-03T01:00:00.000Z", endAt: "2030-09-03T01:00:00.000Z", durationSeconds: 0, distanceMeters: 0, travelMode: "WALK", pathPoints: [{ latitude: 37.5, longitude: 127.0 }, { latitude: 37.51, longitude: 127.01 }] },
        { segmentId: "rent-1", type: "RENT", fromEvidenceId: "rent-e", toEvidenceId: "rent-e", startAt: "2030-09-03T01:00:00.000Z", rentalFacts: { stationName: "성수역 3번 출구", rentalProbability: 0, requiredBikeCount: 0, availableBikeCount: 0 } },
        { segmentId: "ride-1", type: "RIDE", fromEvidenceId: "rent-e", toEvidenceId: "poi-e", startAt: "2030-09-03T01:00:00.000Z", durationSeconds: 780, distanceMeters: 2800, travelMode: "BICYCLE", pathPoints: [{ latitude: 37.51, longitude: 127.01 }, { latitude: 37.52, longitude: 127.02 }] },
        { segmentId: "visit-1", type: "VISIT", fromEvidenceId: "poi-e", toEvidenceId: "poi-e", startAt: "2030-09-03T01:13:00.000Z", stayMinutes: 30, pathPoints: [] },
      ],
      evidence: {
        rentalCandidates: { "rent-e": { evidenceId: "rent-e", source: "core-on-demand-prediction", status: "NORMAL", textFacts: { stationName: "성수역 3번 출구", availabilityLevel: "HIGH" }, numericFacts: { rentalProbability: 0.82, availableBikeCount: 5 } } },
        pois: { "poi-e": { evidenceId: "poi-e", source: "kakao-local", status: "MISSING", textFacts: { displayName: "서울숲", address: "서울 성동구 서울숲길 273" }, numericFacts: {} } },
        routes: { "route:access:station-1": { evidenceId: "route:access:station-1", source: "core-route-provider", status: "UNAVAILABLE", textFacts: { fromEvidenceId: "origin-e", toEvidenceId: "rent-e" }, numericFacts: {} } },
        weather: { "weather-e": { evidenceId: "weather-e", source: "kma-short-forecast", status: "NORMAL", textFacts: { isRainy: "false" }, numericFacts: { temperatureCelsius: 26, precipitationProbabilityPercent: 10 } } },
        airQuality: { "air-e": { evidenceId: "air-e", source: "air-korea", status: "NORMAL", textFacts: { khaiGrade: "GOOD", measurementStation: "성동구" }, numericFacts: {} } },
      },
    },
  };
}

beforeEach(() => window.sessionStorage.removeItem("consumer-journey-planner-draft"));

function draftDecision(aiIntent = {}, verified = {}) {
  return { decisionId: "draft-1", revision: 1, status: "CLARIFICATION_REQUIRED", normalizedIntent: { ...verified, aiIntent }, clarification: { missingFields: ["origin", "destination", "departureAt", "maxJourneyMinutes", "requiredBikeCount"] } };
}

function plannerAdapter(draft = draftDecision()) {
  return { planNaturalLanguage: jest.fn().mockResolvedValue(draft), searchPlaces: jest.fn().mockResolvedValue([]), answerClarification: jest.fn().mockResolvedValue(decision()) };
}

async function compile(text = "서울숲에서 여유롭게 달리고 싶어요") {
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  return screen.findByRole("heading", { name: "AI 조건 확인" });
}

const verifiedContext = { ...plannerContext, destination: place("destination-context", "서울숲") };

function submitConfirmation() { fireEvent.click(screen.getByRole("button", { name: "확인하고 일정 만들기" })); }

test("direct entry requires only a natural-language explanation and pre-fills just the departure time", async () => {
  const adapter = plannerAdapter();
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toHaveValue("");
  expect(screen.queryByLabelText(/출발 장소/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/라이딩 이용 시간/)).not.toBeInTheDocument();
  await compile();
  expect(adapter.planNaturalLanguage).toHaveBeenCalledWith("서울숲에서 여유롭게 달리고 싶어요", expect.objectContaining({ origin: null, destination: null, departureAt: "", maxJourneyMinutes: "", requiredBikeCount: "" }));
  expect(new Date(screen.getByLabelText(/출발 희망 시각/).value).getTime()).toBeGreaterThan(Date.now());
  expect(screen.getByLabelText(/라이딩 이용 시간/)).toHaveValue(null);
  expect(screen.getByLabelText(/필요한 자전거 수/)).toHaveValue(null);
  expect(adapter.answerClarification).not.toHaveBeenCalled();
});

test.each([["   ", "자연어로 설명"], ["가".repeat(501), "500자 이내"]])("invalid prompt focuses the textarea and prevents a call", (text, message) => {
  const adapter = plannerAdapter();
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  const input = screen.getByRole("textbox", { name: "라이딩 계획 설명" });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(input).toHaveFocus();
  expect(adapter.planNaturalLanguage).not.toHaveBeenCalled();
});

test("optional context is compact, removable and never a duplicate initial form", async () => {
  const adapter = plannerAdapter();
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={plannerContext} />);
  expect(screen.getByText(/가져온 조건/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/필요한 자전거 수/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "조건 지우기" }));
  await compile();
  expect(adapter.planNaturalLanguage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ origin: null, maxJourneyMinutes: "", requiredBikeCount: "" }));
});

test("one confirmation selects both provider places and submits every structured condition", async () => {
  const draft = draftDecision({
    origin: { displayName: "성수", placeId: "injected-origin", latitude: 1, longitude: 2 },
    destination: { displayName: "서울숲", placeId: "injected-destination", latitude: 3, longitude: 4 },
    startAt: "2030-09-03T01:00:00Z", totalMinutes: 90, requiredBikeCount: 2, preferences: { cafe: 5 },
  });
  const origin = place("provider-origin", "성수역");
  const destination = place("provider-destination", "서울숲 공원");
  const adapter = plannerAdapter(draft);
  adapter.searchPlaces.mockImplementation((query) => Promise.resolve(query === "성수" ? [origin] : [destination]));
  const onResult = jest.fn();
  const onNavigate = jest.fn();
  render(<ConsumerJourneyPlannerPage adapter={adapter} onResult={onResult} onNavigate={onNavigate} />);
  await compile("여유롭게 달리고 싶어요");
  expect(screen.getByLabelText(/라이딩 이용 시간/)).toHaveValue(90);
  expect(screen.getByLabelText(/필요한 자전거 수/)).toHaveValue(2);
  expect(screen.getByLabelText("카페")).toBeChecked();
  expect(screen.getByLabelText(/출발 장소/)).toHaveValue("성수역");
  expect(screen.getByLabelText(/목적 장소/)).toHaveValue("서울숲 공원");
  expect(screen.getByText(/설명 속 ‘성수’ → 성수역 자동 선택됨/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/출발 희망 시각/), { target: { value: "2030-09-03T10:00" } });
  fireEvent.click(screen.getByLabelText("공원"));
  submitConfirmation();
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenCalledTimes(1));
  expect(adapter.answerClarification).toHaveBeenCalledWith(draft, expect.objectContaining({ origin, destination, departureAt: "2030-09-03T10:00", maxJourneyMinutes: 90, requiredBikeCount: 2, constraints: { themes: ["CAFE", "PARK"] } }));
  expect(JSON.stringify(adapter.answerClarification.mock.calls[0][1])).not.toMatch(/injected|naturalLanguageText|Query/);
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("journey-result", "decision-1"));
  expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ status: "READY" }));
});

test("a conflicting description wins by default and the carried condition stays one click away", async () => {
  const draft = draftDecision({ origin: { displayName: "AI 출발지" }, totalMinutes: 30, requiredBikeCount: 5 }, verifiedContext);
  draft.normalizedIntent.contextConflicts = ["origin", "maxJourneyMinutes", "requiredBikeCount"];
  const aiOrigin = place("ai-origin", "AI 출발지역");
  const adapter = plannerAdapter(draft);
  adapter.searchPlaces.mockImplementation((query) => Promise.resolve(query === "AI 출발지" ? [aiOrigin] : []));
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={verifiedContext} />);
  await compile();
  expect(screen.getByText(/설명에 맞춰 값을 바꿨어요/)).toBeInTheDocument();
  expect(screen.getByLabelText(/출발 장소/)).toHaveValue("AI 출발지역");
  expect(screen.getByLabelText(/라이딩 이용 시간/)).toHaveValue(30);
  expect(screen.getByLabelText(/필요한 자전거 수/)).toHaveValue(5);
  fireEvent.click(screen.getByRole("button", { name: "가져온 조건 유지" }));
  expect(screen.getByText(/가져온 조건을 유지했어요/)).toBeInTheDocument();
  expect(screen.getByLabelText(/출발 장소/)).toHaveValue("성수");
  expect(screen.getByLabelText(/라이딩 이용 시간/)).toHaveValue(120);
  expect(screen.getByLabelText(/필요한 자전거 수/)).toHaveValue(1);
  submitConfirmation();
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenCalledWith(draft, expect.objectContaining({ maxJourneyMinutes: 120, requiredBikeCount: 1, origin: verifiedContext.origin })));
});

test("an auto-selected place can be swapped back to the full provider result list", async () => {
  const draft = draftDecision({ origin: { displayName: "성수" }, destination: { displayName: "한강" }, totalMinutes: 90, requiredBikeCount: 1 });
  const origin = place("provider-origin", "성수역");
  const adapter = plannerAdapter(draft);
  adapter.searchPlaces.mockImplementation((query) => Promise.resolve(query === "성수" ? [origin, place("other-origin", "성수동")] : [place("provider-destination", "한강공원")]));
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile();
  expect(screen.getByLabelText(/출발 장소/)).toHaveValue("성수역");
  fireEvent.click(screen.getByRole("button", { name: "출발 장소 바꾸기" }));
  expect(screen.getByLabelText(/출발 장소/)).toHaveValue("성수");
  expect(screen.queryByText(/성수역 자동 선택됨/)).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: /성수동 출발 장소로 선택/ }));
  expect(screen.getByLabelText(/출발 장소/)).toHaveValue("성수동");
  submitConfirmation();
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenCalledWith(draft, expect.objectContaining({ origin: place("other-origin", "성수동") })));
});

test("a quick departure preset fills a future time in one click", async () => {
  const adapter = plannerAdapter(draftDecision({}, verifiedContext));
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile();
  const field = screen.getByLabelText(/출발 희망 시각/);
  fireEvent.change(field, { target: { value: "" } });
  expect(field).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "1시간 뒤" }));
  expect(new Date(field.value).getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
});

test("a stale draft is discarded so it cannot outrank a new description", () => {
  window.sessionStorage.setItem("consumer-journey-planner-draft", JSON.stringify({ text: "오래된 설명", context: { maxJourneyMinutes: "120" }, savedAt: Date.now() - 31 * 60_000 }));
  render(<ConsumerJourneyPlannerPage adapter={plannerAdapter()} />);
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toHaveValue("");
  expect(screen.queryByText(/가져온 조건/)).not.toBeInTheDocument();
});

test.each([
  ["라이딩 이용 시간", "0", "1분 이상"], ["라이딩 이용 시간", "481", "480분 이하"], ["라이딩 이용 시간", "1.5", "정수"],
  ["필요한 자전거 수", "0", "1대 이상"], ["필요한 자전거 수", "6", "5대 이하"], ["필요한 자전거 수", "", "정수"],
  ["출발 희망 시각", "", "올바른 출발 시각"], ["출발 희망 시각", "2000-01-01T10:00", "현재보다 미래"],
])("confirmation rejects invalid %s=%s with a field-specific message and focus", async (label, value, message) => {
  const adapter = plannerAdapter(draftDecision({}, verifiedContext));
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile();
  const field = screen.getByLabelText(new RegExp(label));
  fireEvent.change(field, { target: { value } });
  submitConfirmation();
  expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
  expect(field).toHaveFocus();
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(adapter.answerClarification).not.toHaveBeenCalled();
  expect(screen.getByText("서울숲에서 여유롭게 달리고 싶어요")).toBeInTheDocument();
});

test.each(["origin", "destination"])("editing a selected %s invalidates the place and rejects stale provider results", async (field) => {
  let resolveFirst;
  const adapter = plannerAdapter(draftDecision({}, verifiedContext));
  adapter.searchPlaces.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValue([place("new-place", "새 검색 결과")]);
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile();
  const input = screen.getByLabelText(field === "origin" ? /출발 장소/ : /목적 장소/);
  fireEvent.change(input, { target: { value: "이전 검색" } });
  await waitFor(() => expect(adapter.searchPlaces).toHaveBeenCalledWith("이전 검색"));
  fireEvent.change(input, { target: { value: "새 검색" } });
  expect(await screen.findByRole("button", { name: /새 검색 결과/ })).toBeInTheDocument();
  await act(async () => resolveFirst([place("stale-place", "오래된 결과")]));
  expect(screen.queryByRole("button", { name: /오래된 결과/ })).not.toBeInTheDocument();
  submitConfirmation();
  expect(adapter.answerClarification).not.toHaveBeenCalled();
  expect(input).toHaveFocus();
});

test.each([
  [{ code: "PREMIUM_REQUIRED", status: 403 }, "Premium 활성 계정"],
  [{ code: "PREMIUM_ENTITLEMENT_UNAVAILABLE", status: 503 }, "Premium 상태"],
  [{ code: "AI_PROVIDER_UNAVAILABLE", status: 503 }, "AI 서비스에 연결"],
  [{ code: "AI_PROVIDER_TIMEOUT", status: 503 }, "응답 시간이 초과"],
  [{ code: "AI_OUTPUT_SCHEMA_INVALID", status: 502 }, "AI 응답 형식"],
  [{ status: 500 }, "서버에서 요청"],
])("AI failure preserves the prompt and distinguishes %j", async (error, message) => {
  const adapter = plannerAdapter();
  adapter.planNaturalLanguage.mockRejectedValue(error);
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "유지할 설명" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toHaveValue("유지할 설명");
  expect(screen.queryByRole("heading", { name: "AI 조건 확인" })).not.toBeInTheDocument();
});

test.each([
  [{ status: "UNAVAILABLE", warnings: ["AI_PROVIDER_TIMEOUT"] }, "응답 시간이 초과"],
  [{ status: "UNAVAILABLE" }, "AI 서비스에 연결"],
  [{ status: "UNKNOWN" }, "AI 응답 형식"],
  [decision("READY"), "AI 응답 형식"],
])("an unavailable or unknown initial response cannot look like successful AI compilation", async (response, message) => {
  const adapter = plannerAdapter(response);
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  fireEvent.change(screen.getByRole("textbox", { name: "라이딩 계획 설명" }), { target: { value: "입력을 유지해요" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toHaveValue("입력을 유지해요");
  expect(screen.queryByRole("heading", { name: "AI 조건 확인" })).not.toBeInTheDocument();
});

test("a failed structured request preserves all values and an unavailable plan never opens results", async () => {
  const adapter = plannerAdapter(draftDecision({}, verifiedContext));
  adapter.answerClarification.mockResolvedValue({ status: "UNAVAILABLE", warnings: ["AI_PROVIDER_TIMEOUT"] });
  const onResult = jest.fn();
  render(<ConsumerJourneyPlannerPage adapter={adapter} onResult={onResult} />);
  await compile();
  fireEvent.change(screen.getByLabelText(/라이딩 이용 시간/), { target: { value: "85" } });
  submitConfirmation();
  expect(await screen.findByRole("alert")).toHaveTextContent("응답 시간이 초과");
  expect(screen.getByLabelText(/라이딩 이용 시간/)).toHaveValue(85);
  expect(screen.getByLabelText(/출발 장소/)).toHaveValue("성수");
  expect(screen.getByText("서울숲에서 여유롭게 달리고 싶어요")).toBeInTheDocument();
  expect(onResult).not.toHaveBeenCalled();
});

test("back and an explicit login preserve the draft across remount, while reset removes it", async () => {
  const adapter = plannerAdapter(draftDecision({}, verifiedContext));
  const onLogin = jest.fn();
  const first = render(<ConsumerJourneyPlannerPage adapter={adapter} onLogin={onLogin} />);
  await compile("로그인 후에도 유지할 설명");
  fireEvent.change(screen.getByLabelText(/라이딩 이용 시간/), { target: { value: "75" } });
  fireEvent.click(screen.getByRole("button", { name: "설명 다시 입력" }));
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toHaveValue("로그인 후에도 유지할 설명");
  adapter.planNaturalLanguage.mockRejectedValue({ status: 401, code: "AUTH_REQUIRED" });
  fireEvent.click(screen.getByRole("button", { name: "AI 조건 정리하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("로그인 세션이 만료");
  expect(onLogin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "다시 로그인" }));
  expect(onLogin).toHaveBeenCalledTimes(1);
  const stored = JSON.parse(window.sessionStorage.getItem("consumer-journey-planner-draft"));
  expect(stored.context.maxJourneyMinutes).toBe("75");
  expect(stored).not.toHaveProperty("decision");
  first.unmount();
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toHaveValue("로그인 후에도 유지할 설명");
  expect(screen.queryByRole("heading", { name: "AI 조건 확인" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "초기화" }));
  expect(screen.getByRole("textbox", { name: "라이딩 계획 설명" })).toHaveValue("");
  expect(window.sessionStorage.getItem("consumer-journey-planner-draft")).toBeNull();
});
test("a server-rebuilt schedule is labelled and its rationale is readable", () => {
  const fallback = decision("PARTIAL");
  fallback.warnings = ["AI_SCHEDULE_FALLBACK", "AI_SCHEDULE_STAGE_VALIDATE_SELECTION"];
  fallback.unifiedPlan.rationale = "STRUCTURED_SERVER_SELECTION";
  render(<ConsumerJourneyPlanResultPage initialDecision={fallback} />);
  expect(screen.getByText(/AI가 제안한 일정이 실제 근거와 맞지 않아/)).toBeInTheDocument();
  expect(screen.getByText("확인된 대여소·장소·경로 근거만으로 서버가 구성한 일정입니다.")).toBeInTheDocument();
  expect(screen.queryByText("STRUCTURED_SERVER_SELECTION")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "추천 이유" })).toBeInTheDocument();
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
  expect(screen.getByText("실시간 대여 예측")).toBeInTheDocument();
  expect(screen.getByText(/대여 가능성 82%/)).toBeInTheDocument();
  expect(screen.getByText(/보유 대수 5대/)).toBeInTheDocument();
  expect(screen.getByText(/재고 상태 여유/)).toBeInTheDocument();
  expect(screen.getByText("카카오맵 장소 정보")).toBeInTheDocument();
  expect(screen.getByText(/주소 서울 성동구 서울숲길 273/)).toBeInTheDocument();
  expect(screen.getByText("기상청 단기예보")).toBeInTheDocument();
  expect(screen.getByText(/기온 26°C/)).toBeInTheDocument();
  expect(screen.getByText(/강수 확률 10%/)).toBeInTheDocument();
  expect(screen.getByText(/비 소식 없음/)).toBeInTheDocument();
  expect(screen.getByText("에어코리아 대기질")).toBeInTheDocument();
  expect(screen.getByText(/통합대기지수 좋음/)).toBeInTheDocument();
  expect(screen.queryByText(/근거 ID/)).not.toBeInTheDocument();
  expect(screen.queryByText(/백엔드 제공 구간/)).not.toBeInTheDocument();
  expect(screen.queryByText("EVIDENCE_ONLY")).not.toBeInTheDocument();
  // RENT (instant, stationary) and VISIT (dwell, no travel) never have a real distance —
  // showing "확인되지 않음" there reads as a data failure instead of "not applicable".
  expect(screen.queryByText(/거리 확인되지 않음/)).not.toBeInTheDocument();
  expect(screen.getByText("시간 30분")).toBeInTheDocument();
});

test("result preserves factual backend segments when the unified plan is unavailable", () => {
  const unavailable = decision("UNAVAILABLE");
  unavailable.unifiedPlan.segments = unavailable.unifiedPlan.segments.slice(0, 2);
  render(<ConsumerJourneyPlanResultPage initialDecision={unavailable} />);
  expect(screen.getByRole("status")).toHaveTextContent("UNAVAILABLE");
  expect(screen.getAllByText("ACCESS").length).toBeGreaterThan(0);
  expect(screen.getAllByText("RENT").length).toBeGreaterThan(0);
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
  expect(screen.queryByRole("button", { name: "알림 신청" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "새 알림 보기" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 계획 저장" }));
  fireEvent.click(await screen.findByRole("button", { name: "알림 신청" }));
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
  expect(screen.getByRole("button", { name: "알림 신청" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "현재 근거로 다시 계획" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "알림 신청" })).not.toBeInTheDocument());
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

test("stale optional timing and invalid optional numbers do not block the initial AI call", async () => {
  const adapter = plannerAdapter(draftDecision({ startAt: "2030-09-03T01:00:00Z", totalMinutes: 60, requiredBikeCount: 2 }));
  render(<ConsumerJourneyPlannerPage adapter={adapter} initialInput={{ ...plannerContext, departureAt: "2000-01-01T10:00", maxJourneyMinutes: 481, requiredBikeCount: 6 }} />);
  await compile();
  expect(adapter.planNaturalLanguage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ origin: plannerContext.origin, departureAt: "", maxJourneyMinutes: "", requiredBikeCount: "" }));
  expect(screen.getByLabelText(/라이딩 이용 시간/)).toHaveValue(60);
  expect(screen.getByLabelText(/필요한 자전거 수/)).toHaveValue(2);
});

test("neutral AI weights do not add themes and preference scores are a read-only summary", async () => {
  const adapter = plannerAdapter(draftDecision({ preferences: { cafe: 3, culture: 3, scenery: 5 } }, verifiedContext));
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile("여유롭게 달리고 싶어요");
  expect(screen.getByLabelText("카페")).not.toBeChecked();
  expect(screen.getByLabelText("문화")).not.toBeChecked();
  expect(screen.getByLabelText("공원")).not.toBeChecked();
  expect(screen.getByText("AI가 해석한 선호 (참고)")).toBeInTheDocument();
  expect(screen.getByText("일정에는 선택한 관심 테마가 반영됩니다.")).toBeInTheDocument();
  expect(screen.queryByLabelText("풍경")).not.toBeInTheDocument();
  expect(screen.queryByText("안정성")).not.toBeInTheDocument();
  expect(screen.getByText("풍경").parentElement).toHaveTextContent("5 / 5");
  submitConfirmation();
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ constraints: { themes: [] }, preferences: { cafe: 3, culture: 3, scenery: 5 } })));
});

test("deselecting inferred lowercase AI interests sends an explicitly empty theme list", async () => {
  const adapter = plannerAdapter(draftDecision({ preferences: { cafe: 5, culture: 4 } }, verifiedContext));
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile("여유롭게 달리고 싶어요");
  expect(screen.getByLabelText("카페")).toBeChecked();
  expect(screen.getByLabelText("문화")).toBeChecked();
  fireEvent.click(screen.getByLabelText("카페"));
  fireEvent.click(screen.getByLabelText("문화"));
  submitConfirmation();
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ constraints: { themes: [] } })));
});

test("themes come from what the rider described, not only from strong preference scores", async () => {
  const adapter = plannerAdapter(draftDecision({ preferences: { cafe: 3, culture: 3, scenery: 3 } }, verifiedContext));
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile("성수에서 한강 쪽으로 달리다가 카페도 들르고 싶어요");
  expect(screen.getByLabelText("카페")).toBeChecked();
  expect(screen.getByLabelText("한강·하천")).toBeChecked();
  expect(screen.getByLabelText("문화")).not.toBeChecked();
  submitConfirmation();
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ constraints: { themes: ["RIVER", "CAFE"] } })));
});

test("an empty carried theme list does not outrank the description", async () => {
  const draft = draftDecision({ preferences: { cafe: 3 } }, { ...verifiedContext, constraints: { themes: [] } });
  const adapter = plannerAdapter(draft);
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile("카페 들르는 라이딩");
  expect(screen.getByLabelText("카페")).toBeChecked();
});

test.each([["AI_PROVIDER_TIMEOUT", "응답 시간이 초과"], ["AI_OUTPUT_SCHEMA_INVALID", "AI 응답 형식"], ["AI_PROVIDER_UNAVAILABLE", "AI 서비스에 연결"], ["AI_TOOL_VALUE_MISMATCH", "실제 근거와 일치하지 않아"]])("AI failure %s shows distinct copy before explicitly opening retained facts", async (code, message) => {
  const adapter = plannerAdapter(draftDecision({}, verifiedContext));
  const unavailable = decision("UNAVAILABLE");
  unavailable.unifiedPlan.segments = unavailable.unifiedPlan.segments.filter((segment) => ["ACCESS", "RENT"].includes(segment.type));
  unavailable.warnings = [code];
  adapter.answerClarification.mockResolvedValue(unavailable);
  const onResult = jest.fn();
  const onNavigate = jest.fn();
  render(<ConsumerJourneyPlannerPage adapter={adapter} onResult={onResult} onNavigate={onNavigate} />);
  await compile();
  submitConfirmation();
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(onResult).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "확보된 실제 근거 보기" }));
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(unavailable));
  expect(onNavigate).toHaveBeenCalledWith("journey-result", unavailable.decisionId);
  expect(onResult.mock.calls[0][0].status).toBe("UNAVAILABLE");
  expect(onResult.mock.calls[0][0].unifiedPlan.segments.map((segment) => segment.type)).toEqual(["ACCESS", "RENT"]);
});

test("an unavailable response without facts retains its revision so retry uses the current decision", async () => {
  const draft = draftDecision({}, verifiedContext);
  const unavailable = { ...draft, revision: 2, status: "UNAVAILABLE", warnings: ["AI_PROVIDER_UNAVAILABLE"] };
  const adapter = plannerAdapter(draft);
  adapter.answerClarification.mockResolvedValueOnce(unavailable).mockResolvedValueOnce(decision());
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile();
  submitConfirmation();
  expect(await screen.findByRole("alert")).toHaveTextContent("AI 서비스에 연결");
  submitConfirmation();
  await waitFor(() => expect(adapter.answerClarification).toHaveBeenNthCalledWith(2, unavailable, expect.objectContaining({ origin: verifiedContext.origin })));
});

test("confirming unchanged AI timing preserves the accepted values through a login failure", async () => {
  const draft = draftDecision({ startAt: "2030-09-03T01:00:00Z", totalMinutes: 95, requiredBikeCount: 3 }, { origin: verifiedContext.origin, destination: verifiedContext.destination });
  const adapter = plannerAdapter(draft);
  adapter.answerClarification.mockRejectedValue({ status: 401, code: "AUTH_REQUIRED" });
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile();
  submitConfirmation();
  expect(await screen.findByRole("alert")).toHaveTextContent("로그인 세션이 만료");
  const stored = JSON.parse(window.sessionStorage.getItem("consumer-journey-planner-draft"));
  expect(stored.context).toEqual(expect.objectContaining({ origin: verifiedContext.origin, destination: verifiedContext.destination, maxJourneyMinutes: 95, requiredBikeCount: 3 }));
  expect(stored.context.departureAt).not.toBe("");
  expect(stored).not.toHaveProperty("decision");
});

test("retry clears prior factual fallback and uses the returned revision without recompiling", async () => {
  const draft = draftDecision({}, verifiedContext);
  const unavailable = { ...decision("UNAVAILABLE"), decisionId: draft.decisionId, revision: 2, warnings: ["AI_PROVIDER_TIMEOUT"] };
  const adapter = plannerAdapter(draft);
  adapter.answerClarification.mockResolvedValueOnce(unavailable).mockRejectedValueOnce({ code: "AI_PROVIDER_UNAVAILABLE" });
  render(<ConsumerJourneyPlannerPage adapter={adapter} />);
  await compile();
  submitConfirmation();
  expect(await screen.findByRole("button", { name: "확보된 실제 근거 보기" })).toBeInTheDocument();
  submitConfirmation();
  expect(screen.queryByRole("button", { name: "확보된 실제 근거 보기" })).not.toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent("AI 서비스에 연결");
  expect(adapter.answerClarification).toHaveBeenNthCalledWith(2, unavailable, expect.any(Object));
  expect(adapter.planNaturalLanguage).toHaveBeenCalledTimes(1);
});

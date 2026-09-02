import { createConsumerSupportAdapter, mapNotification } from "./consumerSupportAdapter";

test("maps only the approved event feed types without leaking legacy station data", () => {
  expect(mapNotification({ id: 1, notificationType: "SEARCH_RECHECK", title: "재확인", actionType: "RECHECK_SUBSCRIPTION", actionRef: "public-1", stationId: 101 })).toEqual(expect.objectContaining({ group: "recheck", action: { kind: "recheck", ref: "public-1" } }));
  expect(mapNotification({ id: 2, notificationType: "QNA_ANSWERED", actionType: "QNA_QUESTION", actionRef: "77" })).toEqual(expect.objectContaining({ group: "qna", action: { kind: "qna", ref: "77" } }));
  expect(mapNotification({ id: 3, notificationType: "PREMIUM_ACTIVE", actionType: "PREMIUM_STATUS" })).toEqual(expect.objectContaining({ group: "premium", action: { kind: "premium", ref: null } }));
  expect(mapNotification({ id: 4, notificationType: "LEGACY", stationId: 101 })).toBeNull();
  expect(mapNotification({ id: 1, notificationType: "SEARCH_RECHECK", stationId: 101 })).not.toHaveProperty("stationId");
});

test("uses exact notification and recheck URLs, CSRF mutations, and request bodies", async () => {
  const api = { request: jest.fn(), mutation: jest.fn() };
  api.request.mockResolvedValueOnce([{ id: 1, notificationType: "PLAN_RECHECK" }]).mockResolvedValueOnce([{ publicId: "sub-1" }]);
  api.mutation.mockResolvedValue({ publicId: "sub-1" });
  const adapter = createConsumerSupportAdapter({ api, qna: {} });
  await expect(adapter.loadAlerts()).resolves.toEqual({ notifications: [expect.objectContaining({ id: 1 })], subscriptions: [{ publicId: "sub-1" }] });
  await adapter.markRead(8);
  await adapter.markAllRead();
  await adapter.createSearchRecheck({
    origin: { providerId: "o", displayName: "출발", latitude: 37.5, longitude: 127, stationId: "legacy" },
    destination: { providerId: "d", displayName: "도착", latitude: 37.6, longitude: 127.1 },
    travelMode: "WALK",
    requiredBikeCount: 2,
    probability: 0.9,
    inventorySnapshot: { bikes: 8 },
  }, "2026-09-03T12:00:00.000Z");
  await adapter.createPlanRecheck("saved-1", "2026-09-03T13:00:00.000Z");
  await adapter.cancelRecheck("public/id");
  await adapter.executeRecheck("public/id");

  expect(api.request.mock.calls).toEqual([["/api/v1/notifications"], ["/api/v1/recheck-subscriptions"]]);
  expect(api.mutation).toHaveBeenCalledWith("/api/v1/notifications/8/read", "POST");
  expect(api.mutation).toHaveBeenCalledWith("/api/v1/notifications/read-all", "POST");
  expect(api.mutation).toHaveBeenCalledWith("/api/v1/recheck-subscriptions", "POST", {
    kind: "SEARCH_RECHECK",
    savedJourneyId: null,
    searchInput: {
      origin: { providerId: "o", displayName: "출발", latitude: 37.5, longitude: 127 },
      destination: { providerId: "d", displayName: "도착", latitude: 37.6, longitude: 127.1 },
      travelMode: "WALK",
      requiredBikeCount: 2,
    },
    departureAt: "2026-09-03T12:00:00.000Z",
  });
  expect(api.mutation).toHaveBeenCalledWith("/api/v1/recheck-subscriptions", "POST", {
    kind: "PLAN_RECHECK",
    savedJourneyId: "saved-1",
    searchInput: null,
    departureAt: "2026-09-03T13:00:00.000Z",
  });
  expect(api.mutation).toHaveBeenCalledWith("/api/v1/recheck-subscriptions/public%2Fid", "DELETE");
  expect(api.mutation).toHaveBeenCalledWith("/api/v1/recheck-subscriptions/public%2Fid/execute", "POST");
});

test("keeps Q&A CRUD on the existing authenticated client", async () => {
  const qna = {
    listQuestions: jest.fn().mockResolvedValue({ items: [] }),
    getQuestion: jest.fn(),
    createQuestion: jest.fn(),
    updateQuestion: jest.fn(),
    deleteQuestion: jest.fn(),
  };
  const adapter = createConsumerSupportAdapter({ api: {}, qna });
  await adapter.listQuestions({ scope: "MINE" });
  adapter.getQuestion(1);
  adapter.createQuestion({ title: "질문" });
  adapter.updateQuestion(1, { title: "수정" });
  adapter.deleteQuestion(1);
  expect(qna.listQuestions).toHaveBeenCalledWith({ scope: "MINE" });
  expect(qna.getQuestion).toHaveBeenCalledWith(1);
  expect(qna.createQuestion).toHaveBeenCalledWith({ title: "질문" });
  expect(qna.updateQuestion).toHaveBeenCalledWith(1, { title: "수정" });
  expect(qna.deleteQuestion).toHaveBeenCalledWith(1);
});

test("fetch implementation obtains a fresh CSRF token for each alert mutation", async () => {
  const response = (body, status = 200) => ({ ok: true, status, json: async () => body });
  global.fetch = jest.fn()
    .mockResolvedValueOnce(response({ headerName: "X-CSRF-TOKEN", token: "one" }))
    .mockResolvedValueOnce(response(null, 204))
    .mockResolvedValueOnce(response({ headerName: "X-CSRF-TOKEN", token: "two" }))
    .mockResolvedValueOnce(response({ kind: "SEARCH_RECHECK", result: {} }));
  const adapter = createConsumerSupportAdapter();
  await adapter.cancelRecheck("sub-1");
  await adapter.executeRecheck("sub-1");
  expect(global.fetch).toHaveBeenNthCalledWith(2, "http://localhost:8080/api/v1/recheck-subscriptions/sub-1", expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ "X-CSRF-TOKEN": "one" }) }));
  expect(global.fetch).toHaveBeenNthCalledWith(4, "http://localhost:8080/api/v1/recheck-subscriptions/sub-1/execute", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-CSRF-TOKEN": "two" }) }));
});

import {
  PREMIUM_ACCESS_STATES,
  consumerPremiumAdapter,
  normalizePremiumAccessState,
} from "./consumerPremiumAdapter";

const catalog = [
  { planId: "PREMIUM_MONTHLY_30D", amount: 3700, currency: "KRW", durationDays: 31 },
  { planId: "PREMIUM_YEARLY_365D", amount: 41000, currency: "KRW", durationDays: 366 },
];

describe("consumerPremiumAdapter", () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = jest.fn(); });
  afterEach(() => { global.fetch = originalFetch; });

  it("keeps the six frozen access states explicit", () => {
    expect(PREMIUM_ACCESS_STATES).toEqual([
      "ANONYMOUS", "FREE", "PROCESSING", "ACTIVE", "EXPIRED", "ERROR",
    ]);
    expect(normalizePremiumAccessState("active")).toBe("ACTIVE");
    expect(normalizePremiumAccessState("UNKNOWN")).toBe("ERROR");
    expect(normalizePremiumAccessState("ACTIVE", "anonymous")).toBe("ANONYMOUS");
  });

  it("loads current server prices and durations with the authenticated session", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ plans: catalog }) });

    await expect(consumerPremiumAdapter.loadPlans()).resolves.toEqual([
      { id: "PREMIUM_MONTHLY_30D", duration: "31일", name: "31일 Premium 테스트 플랜", price: "3,700원", policy: "자동 갱신 없음", featured: false },
      { id: "PREMIUM_YEARLY_365D", duration: "366일", name: "366일 Premium 테스트 플랜", price: "41,000원", policy: "자동 갱신 없음", featured: true },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("http://localhost:8080/api/v1/payments/plans", { credentials: "include" });
    expect(consumerPremiumAdapter.plans).toBeUndefined();
  });

  it("preserves an authentication error without substituting fixture prices", async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ code: "AUTH_REQUIRED" }) });
    await expect(consumerPremiumAdapter.loadPlans()).rejects.toThrow("AUTH_REQUIRED");
  });

  it("rejects a redirected login page or another non-JSON response", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("HTML response"); } });
    await expect(consumerPremiumAdapter.loadPlans()).rejects.toThrow("PAYMENT_PLANS_UNAVAILABLE");
  });

  it("does not accept catalog data from a redirect", async () => {
    fetch.mockResolvedValue({ ok: true, redirected: true, json: async () => ({ plans: catalog }) });
    await expect(consumerPremiumAdapter.loadPlans()).rejects.toThrow("PAYMENT_PLANS_UNAVAILABLE");
  });

  it.each([
    ["missing", {}],
    ["empty", { plans: [] }],
    ["missing amount", { plans: [{ ...catalog[0], amount: undefined }] }],
    ["null amount", { plans: [{ ...catalog[0], amount: null }] }],
    ["invalid amount", { plans: [{ ...catalog[0], amount: 0 }] }],
    ["invalid duration", { plans: [{ ...catalog[0], durationDays: null }] }],
    ["unknown currency", { plans: [{ ...catalog[0], currency: "USD" }] }],
    ["duplicate plan", { plans: [catalog[0], catalog[0]] }],
  ])("rejects %s catalog data", async (_label, body) => {
    fetch.mockResolvedValue({ ok: true, json: async () => body });
    await expect(consumerPremiumAdapter.loadPlans()).rejects.toThrow("PAYMENT_PLANS_UNAVAILABLE");
  });
});

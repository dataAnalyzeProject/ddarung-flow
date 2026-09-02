import {
  PREMIUM_ACCESS_STATES,
  consumerPremiumAdapter,
  normalizePremiumAccessState,
} from "./consumerPremiumAdapter";

describe("consumerPremiumAdapter", () => {
  it("keeps the six frozen access states explicit", () => {
    expect(PREMIUM_ACCESS_STATES).toEqual([
      "ANONYMOUS", "FREE", "PROCESSING", "ACTIVE", "EXPIRED", "ERROR",
    ]);
    expect(normalizePremiumAccessState("active")).toBe("ACTIVE");
    expect(normalizePremiumAccessState("UNKNOWN")).toBe("ERROR");
    expect(normalizePremiumAccessState("ACTIVE", "anonymous")).toBe("ANONYMOUS");
  });

  it("exposes only sandbox presentation plans with no renewal claim", () => {
    expect(consumerPremiumAdapter.plans).toHaveLength(2);
    expect(consumerPremiumAdapter.plans.map((plan) => plan.policy)).toEqual([
      "자동 갱신 없음", "자동 갱신 없음",
    ]);
  });
});

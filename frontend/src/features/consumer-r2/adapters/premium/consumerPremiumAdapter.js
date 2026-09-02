import { premiumPlansFixture } from "../../../premium/data/premiumGuideAccessFixture.js";
import {
  confirmPayment,
  fetchSubscription,
  startCheckout,
} from "../../../premium/subscriptionApi.js";
import { requestTossCheckout } from "../../../premium/tossCheckout.js";

export const PREMIUM_ACCESS_STATES = [
  "ANONYMOUS",
  "FREE",
  "PROCESSING",
  "ACTIVE",
  "EXPIRED",
  "ERROR",
];

export function normalizePremiumAccessState(value, authState = "authenticated") {
  if (authState !== "authenticated") return "ANONYMOUS";
  const normalized = String(value || "FREE").toUpperCase();
  return PREMIUM_ACCESS_STATES.includes(normalized) ? normalized : "ERROR";
}

function toPresentationPlan(plan) {
  return {
    id: plan.planCode,
    duration: plan.duration,
    name: plan.name.replace("라이딩 가이드 ", "Premium "),
    price: plan.price,
    policy: "자동 갱신 없음",
    featured: Boolean(plan.isFeatured),
  };
}

export const consumerPremiumAdapter = {
  plans: premiumPlansFixture.map(toPresentationPlan),
  load: fetchSubscription,
  start: startCheckout,
  confirm: confirmPayment,
  openCheckout: requestTossCheckout,
};

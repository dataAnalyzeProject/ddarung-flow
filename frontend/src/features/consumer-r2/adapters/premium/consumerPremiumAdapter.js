import {
  confirmPayment,
  fetchSubscription,
  startCheckout,
} from "../../../premium/subscriptionApi.js";
import { requestTossCheckout } from "../../../premium/tossCheckout.js";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

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
    id: plan.planId,
    duration: `${plan.durationDays}일`,
    name: `${plan.durationDays}일 Premium 테스트 플랜`,
    price: `${plan.amount.toLocaleString("ko-KR")}원`,
    policy: "자동 갱신 없음",
    featured: plan.planId === "PREMIUM_YEARLY_365D",
  };
}

async function loadPlans() {
  const response = await fetch(`${API_BASE_URL}/api/v1/payments/plans`, { credentials: "include" });
  const body = await response.json().catch(() => null);
  if (response.redirected) throw new Error("PAYMENT_PLANS_UNAVAILABLE");
  if (!response.ok) throw new Error(body?.code || "PAYMENT_PLANS_UNAVAILABLE");
  if (!Array.isArray(body?.plans) || body.plans.length === 0 || body.plans.some((plan) => (
    typeof plan?.planId !== "string" || !plan.planId
    || !Number.isSafeInteger(plan.amount) || plan.amount <= 0
    || plan.currency !== "KRW"
    || !Number.isSafeInteger(plan.durationDays) || plan.durationDays <= 0
  )) || new Set(body.plans.map((plan) => plan.planId)).size !== body.plans.length) {
    throw new Error("PAYMENT_PLANS_UNAVAILABLE");
  }
  return body.plans.map(toPresentationPlan);
}

export const consumerPremiumAdapter = {
  loadPlans,
  load: fetchSubscription,
  start: startCheckout,
  confirm: confirmPayment,
  openCheckout: requestTossCheckout,
};

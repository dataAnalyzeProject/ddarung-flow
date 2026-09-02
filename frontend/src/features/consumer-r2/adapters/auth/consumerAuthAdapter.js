import { getCurrentUser, logout, startSocialLogin } from "../../../login/authApi.js";
import {
  clearPendingPrediction,
  loadPendingPrediction,
  savePendingPrediction,
} from "../../../login/loginStorage.js";

export const AUTH_PRESENTATION_STATE = Object.freeze({
  WAITING: "WAITING",
  LOADING: "LOADING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  LOGGED_OUT: "LOGGED_OUT",
  LOGGING_OUT: "LOGGING_OUT",
});
export function resolveLoginReturnState(search = window.location.search) {
  const query = new URLSearchParams(search);
  const loginResult = query.get("login");

  if (loginResult === "failed") return AUTH_PRESENTATION_STATE.FAILED;
  if (loginResult === "cancelled") return AUTH_PRESENTATION_STATE.CANCELLED;
  if (loginResult === "expired") return AUTH_PRESENTATION_STATE.EXPIRED;
  if (query.get("logout") === "success") return AUTH_PRESENTATION_STATE.LOGGED_OUT;
  return null;
}

export const consumerAuthAdapter = Object.freeze({
  checkSession: getCurrentUser,
  startSocialLogin,
  logout,
  loadPendingPrediction,
  savePendingPrediction,
  clearPendingPrediction,
  resolveLoginReturnState,
});

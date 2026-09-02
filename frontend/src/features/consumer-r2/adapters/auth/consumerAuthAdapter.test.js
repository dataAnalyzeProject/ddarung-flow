import { AUTH_PRESENTATION_STATE, resolveLoginReturnState } from "./consumerAuthAdapter.js";

test.each([
  ["?login=failed&code=AUTH_OAUTH_FAILED", AUTH_PRESENTATION_STATE.FAILED],
  ["?login=cancelled&code=AUTH_OAUTH_CANCELLED", AUTH_PRESENTATION_STATE.CANCELLED],
  ["?login=expired", AUTH_PRESENTATION_STATE.EXPIRED],
  ["?logout=success", AUTH_PRESENTATION_STATE.LOGGED_OUT],
  ["?login=success", null],
])("maps %s to a presentation-only return state", (search, expected) => {
  expect(resolveLoginReturnState(search)).toBe(expected);
});

export const INTRO_SEEN_KEY = "ddarung-flow:intro-seen";

export function hasSeenIntro(storage = window.localStorage) {
  try {
    return storage.getItem(INTRO_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function markIntroSeen(storage = window.localStorage) {
  try {
    storage.setItem(INTRO_SEEN_KEY, "true");
  } catch {
    // 저장을 사용할 수 없어도 사용자는 계속 서비스로 진입할 수 있어야 합니다.
  }
}

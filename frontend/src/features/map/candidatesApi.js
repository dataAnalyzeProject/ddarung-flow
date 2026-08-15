const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

async function fetchCsrfToken() {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/csrf`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("CSRF 토큰을 가져오지 못했습니다.");
  return response.json();
}

// travelMode "WALK"|"PUBLIC_TRANSIT"일 때는 origin/destination 좌표로 후보를 찾고,
// travelMode가 없고 stationId가 있으면 DIRECT 모드로 해당 대여소 기준 후보를 찾는다.
export async function fetchRouteCandidates({
  originLatitude,
  originLongitude,
  destinationLatitude,
  destinationLongitude,
  travelMode,
  minutesAhead,
  requiredBikeCount,
}) {
  const csrf = await fetchCsrfToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/routes/candidates`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify({
      originLatitude,
      originLongitude,
      destinationLatitude,
      destinationLongitude,
      travelMode,
      minutesAhead,
      requiredBikeCount,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("AUTH_REQUIRED");
  }
  if (!response.ok) {
    throw new Error("CANDIDATE_FETCH_FAILED");
  }
  return response.json();
}

// 1. 세션스토리지 저장 키 상수
export const PENDING_PREDICTION_KEY = "ddarung.pendingPrediction.v1";
// 2. 허용할 예측 입력 키 4개 정의
const ALLOWED_KEYS = ["origin", "destination", "travelMode", "directMinutes", "requiredBikeCount"];
/**
 * 예측 입력 4개만 골라 sessionStorage에 저장하는 함수
 */
const MIN_BIKE_COUNT = 1;
const MAX_BIKE_COUNT = 5;
const DEFAULT_BIKE_COUNT = 1;

function normalizeRequiredBikeCount(value) {
    // 입력값의 타입이 number가 아니면 바로 기본값 반환
    if (typeof value !== "number") {
        return DEFAULT_BIKE_COUNT;
    }
    // 정수이면서 범위 안의 값이면 그대로 반환
    return (
        Number.isInteger(value) &&
        value >= MIN_BIKE_COUNT &&
        value <= MAX_BIKE_COUNT
    )
        ? value
        : DEFAULT_BIKE_COUNT;
}
function normalizePlace(place) {
    if (!place || typeof place !== "object") return null;
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
        name: typeof place.name === "string" ? place.name : "",
        latitude,
        longitude,
    };
}

export function savePendingPrediction(input, routePlaces) {
    if (!input || typeof input !== "object") return;
    const filteredInput = {};

    // 허용된 5개 키만 추출하여 새 객체 생성
    ALLOWED_KEYS.forEach((key) => {
        if (input[key] !== undefined) {
            filteredInput[key] = input[key];
        }
    });

    // requiredBikeCount가 정수 1~5 사이가 아니면 기본값 1 적용
    filteredInput.requiredBikeCount = normalizeRequiredBikeCount(input.requiredBikeCount);
    const savedPlaces = {
        origin: normalizePlace(routePlaces?.origin),
        destination: normalizePlace(routePlaces?.destination),
    };
    if (savedPlaces.origin || savedPlaces.destination) filteredInput.routePlaces = savedPlaces;

    // sessionStorage에 JSON 문자열로 저장
    sessionStorage.setItem(PENDING_PREDICTION_KEY, JSON.stringify(filteredInput));
}

/**
 * sessionStorage에서 저장된 예측 입력값을 읽어오는 함수
 * 값이 없거나 JSON 깨짐 오류가 발생하면 안전하게 null 반환
 */
export function loadPendingPrediction() {
    try {
        const data = sessionStorage.getItem(PENDING_PREDICTION_KEY);

        // 저장된 값이 없으면 null 반환
        if (!data) return null;
        // JSON 문자열을 객체로 변환하여 반환
        const parsed = JSON.parse(data);

        // 2. 저장된 값을 불러와 사용할 때도 보정
        return {
            ...parsed,
            requiredBikeCount: normalizeRequiredBikeCount(parsed.requiredBikeCount)
        };
    } catch (error) {
        // JSON 파싱 실패 등 예외 발생 시 안전하게 null 반환
        return null;
    }
}

/**
 * sessionStorage에서 해당 예측 입력 데이터 키만 삭제하는 함수
 */
export function clearPendingPrediction() {
    sessionStorage.removeItem(PENDING_PREDICTION_KEY);
}

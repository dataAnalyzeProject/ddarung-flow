// 1. 세션스토리지 저장 키 상수
export const PENDING_PREDICTION_KEY = "ddarung.pendingPrediction.v1";
// 2. 허용할 예측 입력 키 4개 정의
const ALLOWED_KEYS = ["startStation", "endStation", "transport", "time"];
/**
 * 예측 입력 4개만 골라 sessionStorage에 저장하는 함수
 */
export function savePendingPrediction(input) {
    if (!input || typeof input !== "object") return;
    // 허용된 4개 키만 추출하여 새 객체 생성
    const filteredInput = {};
    ALLOWED_KEYS.forEach((key) => {
        if (input[key] !== undefined) {
            filteredInput[key] = input[key];
        }
    });
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
        return JSON.parse(data);
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
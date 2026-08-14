// CHG-085 approved air-quality DTO fixtures for the riding-guide state UI (FE-4.5).
// Fixture-only: no network fetch, App wiring, or authentication belongs in this file.

export const AIR_QUALITY_GRADE_LABEL = {
  GOOD: "좋음",
  MODERATE: "보통",
  BAD: "나쁨",
  VERY_BAD: "매우 나쁨",
};

export const AIR_QUALITY_STATUS_LABEL = {
  NORMAL: "정상",
  DELAYED: "지연",
  MISSING: "측정값 없음",
  UNAVAILABLE: "조회 불가",
};

export const airQualityNormalFixture = {
  status: "NORMAL",
  measurementStation: "천호 측정소",
  measuredAt: "2026-08-14T10:00:00",
  collectedAt: "2026-08-14T10:03:00",
  khai: { value: 63, grade: "MODERATE" },
  pm10: { value: 42, grade: "MODERATE" },
  pm25: { value: 18, grade: "GOOD" },
  o3: { value: 0.031, grade: "MODERATE" },
};

export const airQualityDelayedFixture = {
  status: "DELAYED",
  measurementStation: "천호 측정소",
  measuredAt: "2026-08-14T07:40:00",
  collectedAt: "2026-08-14T10:03:00",
  khai: { value: 71, grade: "MODERATE" },
  pm10: { value: 48, grade: "MODERATE" },
  pm25: { value: 21, grade: "MODERATE" },
  o3: { value: 0.028, grade: "GOOD" },
};

export const airQualityPartialNullFixture = {
  status: "NORMAL",
  measurementStation: "천호 측정소",
  measuredAt: "2026-08-14T10:00:00",
  collectedAt: "2026-08-14T10:03:00",
  khai: { value: 63, grade: "MODERATE" },
  pm10: { value: 42, grade: "MODERATE" },
  pm25: { value: null, grade: null },
  o3: { value: 0.031, grade: "MODERATE" },
};

export const airQualityMissingFixture = {
  status: "MISSING",
  measurementStation: "천호 측정소",
  measuredAt: "2026-08-14T10:00:00",
  collectedAt: "2026-08-14T10:03:00",
  khai: { value: null, grade: null },
  pm10: { value: null, grade: null },
  pm25: { value: null, grade: null },
  o3: { value: null, grade: null },
};

export const airQualityUnavailableFixture = {
  status: "UNAVAILABLE",
  measurementStation: "천호 측정소",
  measuredAt: "2026-08-14T02:00:00",
  collectedAt: "2026-08-14T10:03:00",
  khai: { value: null, grade: null },
  pm10: { value: null, grade: null },
  pm25: { value: null, grade: null },
  o3: { value: null, grade: null },
};

export default airQualityNormalFixture;

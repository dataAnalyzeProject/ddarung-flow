// FE-4.6 fixture-only data for testing RidingGuidePage's card/section components
// in isolation, and for exercising success / loading / empty / error / stale
// states end to end. No network fetch, App wiring, or authentication belongs here.

import {
  airQualityDelayedFixture,
  airQualityMissingFixture,
  airQualityNormalFixture,
  airQualityUnavailableFixture,
} from "./airQualityMock";

export const successCandidateFixture = {
  stationId: "ST-3",
  stationName: "서울숲 남문",
  arrivalAt: "2026-08-22T15:51:00+09:00",
  predictionTargetAt: "2026-08-22T16:00:00+09:00",
  targetOffsetMinutes: 9,
  featureAsOf: "2026-08-22T15:00:00+09:00",
  horizonMinutes: 60,
  availabilityLevel: "HIGH",
  selectedProbability: 0.87,
  probabilities: { atLeast1: 0.97, atLeast2: 0.93, atLeast3: 0.87, atLeast4: 0.74, atLeast5: 0.58 },
  currentInventory: { availableBikeCount: 8, collectedAt: "2026-08-22T15:32:10+09:00", inventoryStatus: "NORMAL" },
  predictionGeneratedAt: "2026-08-22T15:33:00+09:00",
  predictionStatus: "NORMAL",
  modelVersion: "availability-v1",
  requiredBikeCount: 3,
};

export const staleCandidateFixture = {
  ...successCandidateFixture,
  currentInventory: { availableBikeCount: 5, collectedAt: "2026-08-22T14:10:00+09:00", inventoryStatus: "DELAYED" },
};

export const errorCandidateFixture = {
  ...successCandidateFixture,
  predictionStatus: "UNAVAILABLE",
};

export const emptyCandidateFixture = null;

export const successArrivalWeatherFixture = {
  status: "NORMAL",
  temperatureC: 24,
  precipitationProbabilityPercent: 10,
  precipitationType: "NONE",
  skyStatus: "CLEAR",
  rainGuidance: false,
  issuedAt: "2026-08-22T10:00:00+09:00",
  hourlyForecasts: [],
};

export const staleArrivalWeatherFixture = {
  ...successArrivalWeatherFixture,
  status: "DELAYED",
  message: "날씨 발표가 지연되어 직전 발표 값을 표시합니다.",
};

export const errorArrivalWeatherFixture = {
  status: "UNAVAILABLE",
  message: "날씨 예보를 불러오지 못했습니다.",
};

export const emptyArrivalWeatherFixture = {
  status: "MISSING",
  message: "도착 예정시간의 날씨 예보가 없습니다.",
};

// success / loading / empty / error / stale state combinations for RidingGuidePage
// and its cards. The air-quality-driven cases reuse the approved CHG-085 fixtures;
// the candidate/weather variants mirror the shapes INT-3.4/INT-3.6 already send.
export const ridingGuideStateFixtures = {
  success: {
    candidate: successCandidateFixture,
    arrivalWeather: successArrivalWeatherFixture,
    isWeatherLoading: false,
    airQuality: airQualityNormalFixture,
    isAirQualityLoading: false,
  },
  loading: {
    candidate: null,
    arrivalWeather: null,
    isWeatherLoading: true,
    airQuality: null,
    isAirQualityLoading: true,
  },
  empty: {
    candidate: emptyCandidateFixture,
    arrivalWeather: emptyArrivalWeatherFixture,
    isWeatherLoading: false,
    airQuality: airQualityMissingFixture,
    isAirQualityLoading: false,
  },
  error: {
    candidate: errorCandidateFixture,
    arrivalWeather: errorArrivalWeatherFixture,
    isWeatherLoading: false,
    airQuality: airQualityUnavailableFixture,
    isAirQualityLoading: false,
  },
  stale: {
    candidate: staleCandidateFixture,
    arrivalWeather: staleArrivalWeatherFixture,
    isWeatherLoading: false,
    airQuality: airQualityDelayedFixture,
    isAirQualityLoading: false,
  },
};

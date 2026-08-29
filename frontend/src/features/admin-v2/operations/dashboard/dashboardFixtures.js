const capabilities = {
  rentalRisk: { available: true, source: 'D5', reasonCode: null },
  returnRisk: { available: false, source: null, reasonCode: 'RETURN_INFERENCE_NOT_APPROVED' },
  stationCapacity: { available: false, source: null, reasonCode: 'CAPACITY_SOURCE_MISSING' },
  districtMetadata: { available: false, source: null, reasonCode: 'DISTRICT_SOURCE_MISSING' },
  recurrence: { available: false, source: null, reasonCode: 'OPS_03_OWNED' },
  usageScale: { available: false, source: null, reasonCode: null },
  nearbyAlternatives: { available: false, source: null, reasonCode: 'NEARBY_ALTERNATIVES_UNAVAILABLE' },
};

const stationNames = ['광화문역 1번 출구', '시청역 7번 출구', '서울역 광장', '을지로입구역', '종각역 3번 출구'];
const bands = ['CRITICAL', 'HIGH', 'HIGH', 'WATCH', 'WATCH'];

function items(dataState = 'NORMAL') {
  return stationNames.map((name, index) => ({
    station: { stationNumber: String(1001 + index), name, coordinates: { latitude: 37.56 + (index * 0.007), longitude: 126.97 + (index * 0.008) }, currentBikes: index + 1, capacity: index === 3 ? null : 15 },
    predictionTargetAt: '2026-08-30T10:00:00+09:00', dataState,
    riskBand: bands[index],
    rentalRisk: { selectedRequiredBikeCount: 1, selectedShortageProbability: 0.82 - (index * 0.1) },
  }));
}

function overview(dataState = 'NORMAL', overrides = {}) {
  return {
    referenceTime: '2026-08-30T09:00:00+09:00', generatedAt: '2026-08-30T09:01:00+09:00', horizonMinutes: 60,
    capabilities, dataState, coverage: { activeStationCount: 120, inventoryAvailableCount: 118, predictionAvailableCount: 116, profileAvailableCount: 0 },
    limitations: [], ruleVersion: 'OPS_D5_V1',
    rentalRiskSummary: { selectedRequiredBikeCount: 1, validPredictionCount: 116, criticalCount: 1, highCount: 2, watchCount: 2, lowCount: 111, maxShortageProbability: 0.82, averageShortageProbability: 0.42 },
    inventoryStateSummary: { normal: 110, delayed: 5, missing: 3, unavailable: 2 }, returnRisk: null,
    ...overrides,
  };
}

export function dashboardFixture(name = 'SUCCESS') {
  switch (name) {
    case 'PARTIAL': return { overview: overview('MISSING'), risk: null, riskError: { status: 500, code: 'RISK_STATIONS_UNAVAILABLE', message: '위험 대여소 데이터를 불러오지 못했습니다.' } };
    case 'DELAYED': return { overview: overview('DELAYED'), risk: { referenceTime: '2026-08-30T08:40:00+09:00', items: items('DELAYED') }, riskError: null };
    case 'MISSING': return { overview: overview('MISSING'), risk: { referenceTime: '2026-08-30T09:00:00+09:00', items: items('MISSING') }, riskError: null };
    case 'INSUFFICIENT_DATA': return { overview: overview('INSUFFICIENT_DATA'), risk: { referenceTime: '2026-08-30T09:00:00+09:00', items: [] }, riskError: null };
    case 'UNAVAILABLE': return { overview: overview('UNAVAILABLE'), risk: { referenceTime: '2026-08-30T09:00:00+09:00', items: [] }, riskError: null };
    case 'EMPTY': return { overview: overview('NORMAL', { coverage: { activeStationCount: 0, inventoryAvailableCount: 0, predictionAvailableCount: 0, profileAvailableCount: 0 }, limitations: ['NO_ACTIVE_PUBLIC_STATIONS'] }), risk: { referenceTime: '2026-08-30T09:00:00+09:00', items: [] }, riskError: null };
    case 'MAP_FORBIDDEN': return { overview: overview(), risk: null, riskError: { status: 403, code: 'ADMIN_PERMISSION_DENIED', message: '위험 지도 권한이 없습니다.' } };
    case 'ERROR': throw new Error('운영 데이터를 불러오지 못했습니다.');
    default: return { overview: overview(), risk: { referenceTime: '2026-08-30T09:00:00+09:00', items: items() }, riskError: null };
  }
}

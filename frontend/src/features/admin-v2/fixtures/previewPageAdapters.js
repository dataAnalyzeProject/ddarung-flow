const REFERENCE_TIME = '2026-08-31T09:00:00+09:00';

const candidates = {
  referenceTime: REFERENCE_TIME,
  generatedAt: '2026-08-31T09:01:00+09:00',
  horizonMinutes: 60,
  requiredBikeCount: 1,
  riskType: 'RENTAL',
  dataState: 'NORMAL',
  coverage: { activePublicStationCount: 4, inventoryAvailableCount: 4, predictionAvailableCount: 4, profileAvailableCount: 3, eligibleCandidateCount: 2 },
  limitations: ['RECURRENCE_PROFILE_PARTIAL'],
  nextCursor: null,
  items: [
    { rank: 1, dataState: 'NORMAL', station: { name: '광화문역 1번 출구', stationNumber: '1001', currentBikes: 0 }, prediction: { selectedShortageProbability: 0.83, predictionTargetAt: '2026-08-31T10:00:00+09:00' }, recurrence: { available: true, sampleCount: 12, observedStockoutRate: 0.25, windowStart: '2026-08-01', windowEnd: '2026-08-28', episodeCount: 3, medianBikeCount: 0, medianDurationMinutes: 10, p90DurationMinutes: 20, medianRecoveryMinutesToThree: 5 } },
    { rank: 2, dataState: 'NORMAL', station: { name: '시청역 7번 출구', stationNumber: '1002', currentBikes: 2 }, prediction: { selectedShortageProbability: 0.67, predictionTargetAt: '2026-08-31T10:00:00+09:00' }, recurrence: { available: false, reasonCode: 'RECURRENCE_PROFILE_MISSING' } },
  ],
};

function analysis(view = 'WEEKDAY') {
  return {
    referenceTime: REFERENCE_TIME, generatedAt: '2026-08-31T09:01:00+09:00', view, riskType: 'RENTAL', ruleVersion: 'OPS_ANALYSIS_STOCKOUT_V1', windowRuleVersion: 'OPS_ANALYSIS_WINDOW_V1', metric: 'OBSERVED_STOCKOUT_RATE', dataState: 'NORMAL',
    selectedWindowStart: '2026-08-01', selectedWindowEnd: '2026-08-28', selectedWindowProfileCount: 2, excludedDifferentWindowProfileCount: 1,
    coverage: { activePublicStationCount: 4, profileAvailableStationCount: 3, selectedWindowProfileCount: 2, parsedProfileCount: 2, usableCellCount: 2, expectedCellCount: 336, profileCoverageRate: 0.75, cellCoverageRate: 0.006 },
    buckets: Array.from({ length: view === 'HOUR' ? 24 : 7 }, (_, key) => ({ key: view === 'HOUR' ? key : key + 1, sampleCount: key === 0 ? 10 : 0, contributingStationCount: key === 0 ? 2 : 0, observedStockoutRate: key === 0 ? 0.3 : null })),
    weekdayHourCells: Array.from({ length: 168 }, (_, index) => ({ dayOfWeek: Math.floor(index / 24) + 1, hourOfDay: index % 24, sampleCount: index === 0 ? 10 : 0, contributingStationCount: index === 0 ? 2 : 0, observedStockoutRate: index === 0 ? 0.3 : null })),
    limitations: ['DISTRICT_SOURCE_MISSING'],
  };
}

const dataStatus = {
  referenceTime: REFERENCE_TIME, generatedAt: '2026-08-31T09:01:00+09:00', dataState: 'NORMAL',
  inventory: { dataState: 'NORMAL', expectedStationCount: 4, latestStationCount: 4, missingStationCount: 0, latestCollectedAt: '2026-08-31T08:58:00+09:00', p50DelayMinutes: 2, p95DelayMinutes: 4, inventoryStatusBreakdown: { NORMAL: 4, UNAVAILABLE: 0 } },
  prediction: { dataState: 'NORMAL', featureAsOf: '2026-08-31T08:00:00+09:00', generatedAt: '2026-08-31T08:01:00+09:00', publishedAt: '2026-08-31T08:02:00+09:00', expiresAt: '2026-08-31T10:00:00+09:00', predictedStationCount: 4, predictionRowCount: 4, coverageRatio: 1 },
  profile: { dataState: 'NORMAL', activePublicStationCount: 4, profileAvailableStationCount: 3, coverageRatio: 0.75, latestGeneratedAt: '2026-08-30T09:00:00+09:00' },
  limitations: ['AFFECTED_SCOPE_NOT_SOURCE_BACKED'],
};

const previewModels = [{ id: 1, version: 'model-preview-5.2', state: 'VALIDATED', createdAt: '2026-08-31T00:00:00Z' }];
const modelOverview = { runtime: { state: 'ERROR', error: { code: 'MODEL_RUNTIME_PREVIEW_UNAVAILABLE' } }, registry: { state: 'SUCCESS', data: previewModels }, models: previewModels, registryStateCounts: { DRAFT: 0, VALIDATED: 1, APPROVED: 0, ACTIVE: 0, RETIRED: 0 } };
const modelPerformance = { artifactSha256: 'a'.repeat(64), modelVersion: 'model-preview-5.2', generatedAt: REFERENCE_TIME, evaluation: { referenceHorizonMinutes: 120, referenceRequiredBikeCount: 3, minSampleThreshold: 1000 }, combinations: [{ horizonMinutes: 60, requiredBikeCount: 1, sampleCount: 1100, brierScore: 0.0304 }, { horizonMinutes: 120, requiredBikeCount: 3, sampleCount: 999, brierScore: null }], calibrationBins: [{ binLowerPercent: 0, binUpperPercent: 10, sampleCount: 0, meanPredicted: null, actualRate: null }] };
const modelReleases = { permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'], runtime: { state: 'ERROR', error: { code: 'MODEL_RUNTIME_PREVIEW_UNAVAILABLE' } }, registry: { state: 'SUCCESS', data: previewModels }, history: { state: 'ACCESS_LIMITED', permission: 'AUDIT_READ' } };
const support = { permissions: [], items: [{ key: 'preview-question-1', title: '대여 가능성 예측 문의', body: '예측 결과가 표시되지 않을 때 확인할 사항을 문의했습니다.', category: 'SERVICE', visibility: 'PUBLIC', status: 'PENDING', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T01:00:00Z', answers: [] }] };
const accessPage = { access: { permissions: ['ACCESS_READ'] }, roles: [{ roleCode: 'OPS_VIEWER', displayName: '운영 조회자', description: '운영 현황을 조회합니다.', permissions: ['OPS_DASHBOARD_READ'], systemRole: false, protectedRole: false }], users: { items: [{ userId: 'preview-admin-a', displayName: '관리자 A', role: 'ADMIN', adminRoles: [{ roleCode: 'OPS_VIEWER', expiresAt: null }], protectedUser: false, version: 1 }], page: 0, size: 20, total: 1 } };
const accessDetail = { publicUserId: 'preview-admin-a', displayName: '관리자 A', accountRole: 'ADMIN', adminRoles: [{ roleCode: 'OPS_VIEWER', expiresAt: null }], protectedUser: false, version: 1 };
const auditPage = { items: [{ action: 'ROLE_CHANGE', targetType: 'USER', actorRoleCodes: ['ACCESS_ADMIN'], result: 'SUCCESS', reasonCode: 'ROLE_CHANGED', occurredAt: REFERENCE_TIME }], page: 0, size: 20, total: 1 };

export function createPreviewAdapterForRoute(routeId) {
  switch (routeId) {
    case 'UI-OPS-03': return () => ({ load: () => Promise.resolve(candidates) });
    case 'UI-OPS-04': return () => ({ load: ({ view }) => Promise.resolve(analysis(view)) });
    case 'UI-OPS-05': return () => ({ load: () => Promise.resolve(dataStatus) });
    case 'UI-MODEL-01': return () => ({ load: () => Promise.resolve(modelOverview) });
    case 'UI-MODEL-02': return () => ({ loadBase: () => Promise.resolve(modelPerformance), loadDiagnostics: () => Promise.resolve({ segments: [] }) });
    case 'UI-MODEL-04': return () => ({ load: () => Promise.resolve(modelReleases), action: () => Promise.reject({ code: 'PREVIEW_MUTATION_DISABLED' }) });
    case 'UI-SYS-01': return () => ({ load: () => Promise.resolve(support), answer: () => Promise.reject({ code: 'PREVIEW_MUTATION_DISABLED' }), hide: () => Promise.reject({ code: 'PREVIEW_MUTATION_DISABLED' }) });
    case 'UI-SYS-02': return () => ({ loadPage: () => Promise.resolve(accessPage), loadUser: () => Promise.resolve(accessDetail), replaceRoles: () => Promise.reject({ code: 'PREVIEW_MUTATION_DISABLED' }) });
    case 'UI-SYS-03': return () => ({ load: ({ page = 0 }) => Promise.resolve({ ...auditPage, page }) });
    default: return null;
  }
}

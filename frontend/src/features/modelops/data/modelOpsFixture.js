// frontend/src/features/modelops/data/modelOpsFixture.js
// 6가지 모델 상태 규격
export const MODEL_STATES = [
  'DRAFT',
  'VALIDATED',
  'APPROVED',
  'ACTIVE',
  'REJECTED',
  'RETIRED',
];

// 기본 모델 목록 fixture (4종 모델)
export const modelOpsFixture = [
  {
    modelId: 'model-v2.1.0',
    version: 'v2.1.0',
    state: 'ACTIVE',
    metrics: {
      brier: 0.082,
      shortageRecall: 0.941,
      freshness: '10분 전',
    },
    promotionGate: {
      passed: true,
      reasonCodes: ['GATE_PASSED_ALL_CRITERIA'],
    },
    history: [
      {
        timestamp: '2026-08-25 10:00:00',
        action: 'activate',
        fromState: 'APPROVED',
        toState: 'ACTIVE',
        actor: 'admin-1',
      },
    ],
  },
  {
    modelId: 'model-v2.2.0-rc1',
    version: 'v2.2.0-rc1',
    state: 'APPROVED',
    metrics: {
      brier: 0.075,
      shortageRecall: 0.958,
      freshness: '1시간 전',
    },
    promotionGate: {
      passed: true,
      reasonCodes: ['GATE_PASSED_METRICS_IMPROVED'],
    },
    history: [
      {
        timestamp: '2026-08-25 11:30:00',
        action: 'approve',
        fromState: 'VALIDATED',
        toState: 'APPROVED',
        actor: 'admin-1',
      },
    ],
  },
  {
    modelId: 'model-v2.3.0-draft',
    version: 'v2.3.0-draft',
    state: 'DRAFT',
    metrics: {
      brier: 0.112,
      shortageRecall: 0.884,
      freshness: '3시간 전',
    },
    promotionGate: {
      passed: false,
      reasonCodes: ['METRIC_RECALL_BELOW_THRESHOLD', 'VALIDATION_PENDING'],
    },
    history: [
      {
        timestamp: '2026-08-25 08:00:00',
        action: 'create',
        fromState: 'NONE',
        toState: 'DRAFT',
        actor: 'system',
      },
    ],
  },
  {
    modelId: 'model-v2.0.4',
    version: 'v2.0.4',
    state: 'RETIRED',
    metrics: {
      brier: 0.095,
      shortageRecall: 0.912,
      freshness: '2일 전',
    },
    promotionGate: {
      passed: false,
      reasonCodes: ['MODEL_RETIRED_SUPERSEDED'],
    },
    history: [
      {
        timestamp: '2026-08-25 10:00:00',
        action: 'retire',
        fromState: 'ACTIVE',
        toState: 'RETIRED',
        actor: 'admin-1',
      },
    ],
  },
];

// 5대 상태 화면 테스트용 fixture 세트
export const modelOpsStatusFixtures = {
  loading: { status: 'loading', models: [] },
  success: { status: 'success', models: modelOpsFixture },
  empty: { status: 'empty', models: [] },
  error: { status: 'error', models: [] },
  forbidden: { status: 'forbidden', models: [] },
};

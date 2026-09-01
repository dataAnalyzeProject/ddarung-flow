const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class ModelPerformanceApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '모델 검증 정보를 불러오지 못했습니다.');
    this.name = 'ModelPerformanceApiError';
    this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : 'MODEL_PERFORMANCE_API_ERROR');
  }
}

function requiredString(value) { return typeof value === 'string' && value.trim() ? value : null; }
function requiredArray(value) { return Array.isArray(value) ? value : null; }

function baseProjection(body) {
  if (!body || typeof body !== 'object' || Object.prototype.hasOwnProperty.call(body, 'segments')) {
    throw new ModelPerformanceApiError({ code: 'MODEL_PERFORMANCE_RESPONSE_INVALID' });
  }
  const artifactSha256 = requiredString(body.artifactSha256);
  const modelVersion = requiredString(body.modelVersion);
  const generatedAt = requiredString(body.generatedAt);
  const combinations = requiredArray(body.combinations);
  const calibrationBins = requiredArray(body.calibrationBins);
  if (!artifactSha256 || !modelVersion || !generatedAt || !combinations || !calibrationBins || !body.evaluation || typeof body.evaluation !== 'object') {
    throw new ModelPerformanceApiError({ code: 'MODEL_PERFORMANCE_RESPONSE_INVALID' });
  }
  return { artifactSha256, modelVersion, generatedAt, evaluation: body.evaluation, combinations, calibrationBins };
}

function diagnosticsProjection(body, base) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.segments)
    || body.artifactSha256 !== base.artifactSha256 || body.modelVersion !== base.modelVersion || body.generatedAt !== base.generatedAt) {
    throw new ModelPerformanceApiError({ code: 'DIAGNOSTICS_SNAPSHOT_MISMATCH' });
  }
  return { segments: body.segments };
}

async function request(path, signal) {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', signal });
    let body = {};
    try { body = await response.json(); } catch (_) { /* body is optional on errors */ }
    if (!response.ok) throw new ModelPerformanceApiError({ status: response.status, code: body.code, message: body.message });
    return body;
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof ModelPerformanceApiError) throw error;
    throw new ModelPerformanceApiError({ status: error?.status, code: error?.code, message: error?.message });
  }
}

export function createLiveModelPerformanceAdapter() {
  return {
    async loadBase({ signal }) {
      return baseProjection(await request('/api/v1/admin/model-performance', signal));
    },
    async loadDiagnostics(base, { signal }) {
      const artifactSha256 = encodeURIComponent(base.artifactSha256);
      return diagnosticsProjection(await request(`/api/v1/admin/model-performance/diagnostics?artifactSha256=${artifactSha256}`, signal), base);
    },
  };
}

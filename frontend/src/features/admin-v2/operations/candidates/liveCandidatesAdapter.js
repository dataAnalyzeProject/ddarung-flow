import { adminFetch } from '../../auth/adminSession.js';
import { clearOpsRiskSnapshotId, readOpsRiskSnapshotId } from '../opsRiskSnapshotStorage.js';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export class CandidatesApiError extends Error {
  constructor({ status, code, message }) {
    super(message || code || '집중관리 목록을 불러오지 못했습니다.');
    this.name = 'CandidatesApiError';
    this.status = status;
    this.code = code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'ADMIN_PERMISSION_DENIED' : 'OPS_API_ERROR');
  }
}

function queryString({ horizonMinutes, requiredBikeCount, limit, cursor, snapshotId }) {
  const query = new URLSearchParams({
    horizonMinutes: String(horizonMinutes),
    requiredBikeCount: String(requiredBikeCount),
    riskType: 'RENTAL',
    limit: String(limit),
  });
  if (cursor) query.set('cursor', cursor);
  if (snapshotId) query.set('snapshotId', snapshotId);
  return query.toString();
}

async function request(horizonMinutes, requiredBikeCount, limit, cursor, snapshotId, signal) {
  const response = await adminFetch(`${API_BASE_URL}/api/v1/admin/ops/candidates?${queryString({ horizonMinutes, requiredBikeCount, limit, cursor, snapshotId })}`, { credentials: 'include', signal });
  if (response.ok) return response.json();
  let body = {};
  try { body = await response.json(); } catch (_) { /* response body is optional */ }
  throw new CandidatesApiError({ status: response.status, code: body.code, message: body.message });
}

export function createLiveCandidatesAdapter() {
  return {
    // Current candidates are ranked within the bounded map scope the operator last analyzed on
    // /admin/ops/risk-map, read from the same sessionStorage key that page writes to (see
    // ADMIN-OPS-SNAPSHOT-01). Without one, the backend reports ANALYSIS_SCOPE_REQUIRED rather than
    // falling back to a citywide legacy batch. A cursor already carries its own snapshotId, so it
    // is not re-appended here (the backend rejects a mismatched pair as VALIDATION_ERROR).
    async load({ horizonMinutes, requiredBikeCount, limit, cursor, signal }) {
      const snapshotId = cursor ? null : readOpsRiskSnapshotId(horizonMinutes, requiredBikeCount);
      try {
        return await request(horizonMinutes, requiredBikeCount, limit, cursor, snapshotId, signal);
      } catch (error) {
        // A cursor carries its own snapshotId, so retrying it without one resolves the same expired
        // snapshot and fails again — only a fresh load is recoverable here.
        if (error.name === 'AbortError' || error.code !== 'RISK_SNAPSHOT_EXPIRED' || cursor) throw error;
        clearOpsRiskSnapshotId(horizonMinutes, requiredBikeCount);
        const retried = await request(horizonMinutes, requiredBikeCount, limit, cursor, null, signal);
        // The retry can only report ANALYSIS_SCOPE_REQUIRED, which would misread as "never analyzed".
        // Only the client knows the scope existed and expired, so it says so here.
        return { ...retried, scopeExpired: true };
      }
    },
  };
}

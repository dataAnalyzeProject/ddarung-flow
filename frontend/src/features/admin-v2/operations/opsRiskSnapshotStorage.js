const KEY_PREFIX = 'adminOpsRiskSnapshot';

// Shared between the ops dashboard (reader) and the risk map page (writer) so
// the two can never drift onto different key formats. The dashboard uses this
// to show scoped overview/Top 5 data for the map scope the operator most
// recently selected; the risk map page writes into it whenever a scope
// selection succeeds.
export function opsRiskSnapshotKey(horizonMinutes, requiredBikeCount) {
  return `${KEY_PREFIX}:${horizonMinutes}:${requiredBikeCount}`;
}

export function readOpsRiskSnapshotId(horizonMinutes, requiredBikeCount) {
  try {
    return window.sessionStorage.getItem(opsRiskSnapshotKey(horizonMinutes, requiredBikeCount));
  } catch {
    return null;
  }
}

export function writeOpsRiskSnapshotId(horizonMinutes, requiredBikeCount, snapshotId) {
  if (!snapshotId) return;
  try {
    window.sessionStorage.setItem(opsRiskSnapshotKey(horizonMinutes, requiredBikeCount), snapshotId);
  } catch {
    // sessionStorage unavailable (private browsing, quota, etc.) — the map
    // scope simply won't carry over to the dashboard, nothing else breaks.
  }
}

export function clearOpsRiskSnapshotId(horizonMinutes, requiredBikeCount) {
  try {
    window.sessionStorage.removeItem(opsRiskSnapshotKey(horizonMinutes, requiredBikeCount));
  } catch {
    // ignore
  }
}

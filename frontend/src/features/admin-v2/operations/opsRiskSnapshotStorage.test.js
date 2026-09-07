import {
  clearOpsRiskSnapshotId,
  opsRiskSnapshotKey,
  readOpsRiskSnapshotId,
  writeOpsRiskSnapshotId,
} from './opsRiskSnapshotStorage.js';

describe('ops risk snapshot storage', () => {
  beforeEach(() => window.sessionStorage.clear());

  test('keys by horizon and required bike count', () => {
    expect(opsRiskSnapshotKey(60, 1)).toBe('adminOpsRiskSnapshot:60:1');
    expect(opsRiskSnapshotKey(120, 3)).toBe('adminOpsRiskSnapshot:120:3');
  });

  test('round-trips a written snapshot id', () => {
    writeOpsRiskSnapshotId(60, 1, 'snapshot-1');
    expect(readOpsRiskSnapshotId(60, 1)).toBe('snapshot-1');
    expect(readOpsRiskSnapshotId(120, 3)).toBeNull();
  });

  test('ignores a falsy snapshot id instead of writing an empty value', () => {
    writeOpsRiskSnapshotId(60, 1, null);
    expect(readOpsRiskSnapshotId(60, 1)).toBeNull();
  });

  test('clears only the matching horizon/required key', () => {
    writeOpsRiskSnapshotId(60, 1, 'snapshot-1');
    writeOpsRiskSnapshotId(120, 3, 'snapshot-2');
    clearOpsRiskSnapshotId(60, 1);
    expect(readOpsRiskSnapshotId(60, 1)).toBeNull();
    expect(readOpsRiskSnapshotId(120, 3)).toBe('snapshot-2');
  });

  test('reads return null instead of throwing when sessionStorage is unavailable', () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', { value: { getItem() { throw new Error('blocked'); } }, configurable: true });
    expect(readOpsRiskSnapshotId(60, 1)).toBeNull();
    Object.defineProperty(window, 'sessionStorage', { value: original, configurable: true });
  });

  test('writes do not throw when sessionStorage is unavailable', () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', { value: { setItem() { throw new Error('blocked'); } }, configurable: true });
    expect(() => writeOpsRiskSnapshotId(60, 1, 'snapshot-1')).not.toThrow();
    Object.defineProperty(window, 'sessionStorage', { value: original, configurable: true });
  });
});

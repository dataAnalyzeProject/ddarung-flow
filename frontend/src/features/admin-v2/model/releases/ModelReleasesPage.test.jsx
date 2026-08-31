import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelReleasesPage from './ModelReleasesPage';

const base = { permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'], batches: { state: 'SUCCESS', data: { batches: [{ batchId: 'b1', modelVersion: 'batch-v1', publishStatus: 'ACTIVE', featureAsOf: '2026-08-31T00:00:00Z', expiresAt: '2026-08-31T01:00:00Z', coverageRatio: 1 }] } }, registry: { state: 'SUCCESS', data: [{ id: 1, version: 'safe-v1', state: 'DRAFT', createdAt: '2026-08-31T00:00:00Z' }] }, history: { state: 'ACCESS_LIMITED', permission: 'AUDIT_READ' } };
function adapterFor(result, action = jest.fn().mockResolvedValue({})) { return () => ({ load: jest.fn().mockResolvedValue(result), action }); }

describe('ModelReleasesPage', () => {
  test('keeps base batches while optional sources are access-limited and states runtime restriction', async () => {
    render(<ModelReleasesPage createAdapter={adapterFor(base)} />); await waitFor(() => expect(screen.getByRole('heading', { name: '모델 버전 관리' })).toBeInTheDocument());
    expect(screen.queryByText('레지스트리 접근 제한')).not.toBeInTheDocument(); expect(screen.getByText('변경 이력 접근 제한')).toBeInTheDocument(); expect(screen.getByText('batch-v1')).toBeInTheDocument(); expect(screen.getByText('LIVE_SERVING_EFFECT_UNVERIFIED')).toBeInTheDocument();
  });
  test('renders source-truth empty independently', async () => {
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, batches: { state: 'SUCCESS', data: { batches: [] } }, registry: { state: 'SUCCESS', data: [] } })} />); await waitFor(() => expect(screen.getAllByText('표시할 항목 없음')).toHaveLength(2));
  });
  test('preserves prior data when an action fails and has no reason or expectedVersion input', async () => {
    const action = jest.fn().mockRejectedValue({ code: 'MODEL_PROMOTION_GATE_FAILED' }); render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_VALIDATE'] }, action)} />);
    await waitFor(() => expect(screen.getByText('safe-v1')).toBeInTheDocument()); fireEvent.click(screen.getByRole('button', { name: '검증' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('MODEL_PROMOTION_GATE_FAILED')); expect(screen.getByText('safe-v1')).toBeInTheDocument(); expect(screen.queryByLabelText(/reason|사유/i)).not.toBeInTheDocument(); expect(screen.queryByLabelText(/expectedVersion/i)).not.toBeInTheDocument();
  });
  test('does not render secret or artifact fields from registry input', async () => {
    const result = { ...base, registry: { state: 'SUCCESS', data: [{ ...base.registry.data[0], artifactKey: 'private/object', sha256: 'hash', objectKey: 'secret-token' }] } }; render(<ModelReleasesPage createAdapter={adapterFor(result)} />);
    await waitFor(() => expect(screen.getByText('safe-v1')).toBeInTheDocument()); expect(screen.queryByText(/private\/object|secret-token|hash/)).not.toBeInTheDocument(); expect(screen.getByText(/ACTIVE는 레지스트리 lifecycle 상태/)).toBeInTheDocument(); expect(screen.getByText(/batch modelVersion은 배치 메타데이터/)).toBeInTheDocument();
  });
  test('shows unavailable history instead of fabricating a globally paged audit result', async () => {
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, history: { state: 'UNAVAILABLE', code: 'MODEL_LIFECYCLE_AUDIT_SCOPE_UNAVAILABLE' } })} />); await waitFor(() => expect(screen.getByText('변경 이력 확인 불가')).toBeInTheDocument()); expect(screen.queryByText('표시할 항목 없음')).toBeNull();
  });
});

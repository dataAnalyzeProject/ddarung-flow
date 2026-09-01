import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelReleasesPage from './ModelReleasesPage';

const runtime = { state: 'SUCCESS', data: { status: 'NORMAL', modelVersion: 'runtime-v1', artifactSha256: 'a'.repeat(64), modelSource: 'verified_active_pointer', loadedAt: '2026-09-01T00:00:00Z', supportedHorizons: [60, 120, 180, 240], supportedQuantities: [1, 2, 3, 4, 5] } };
const base = { permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'], runtime, registry: { state: 'SUCCESS', data: [{ id: 1, version: 'safe-v1', state: 'DRAFT', createdAt: '2026-08-31T00:00:00Z' }] }, history: { state: 'ACCESS_LIMITED', permission: 'AUDIT_READ' } };
function adapterFor(result, action = jest.fn().mockResolvedValue({}), refresh) { return () => ({ load: jest.fn().mockResolvedValue(result), action, refresh }); }

describe('ModelReleasesPage', () => {
  test('shows runtime identity and registry lifecycle without batch UI', async () => {
    render(<ModelReleasesPage createAdapter={adapterFor(base)} />); await waitFor(() => expect(screen.getByRole('heading', { name: '모델 버전 관리' })).toBeInTheDocument());
    expect(screen.getByText('runtime-v1')).toBeInTheDocument(); expect(screen.getByText('LIVE_SERVING_EFFECT_UNVERIFIED')).toBeInTheDocument(); expect(screen.getByText('safe-v1')).toBeInTheDocument(); expect(screen.queryByText('예측 배치')).not.toBeInTheDocument();
  });
  test('does not fail the release page when runtime permission is absent', async () => {
    const result = { ...base, permissions: ['MODEL_RELEASE_READ'], runtime: { state: 'ACCESS_LIMITED', permission: 'MODEL_METRICS_READ' }, registry: { state: 'ACCESS_LIMITED', permission: 'MODEL_METRICS_READ' } };
    render(<ModelReleasesPage createAdapter={adapterFor(result)} />); await waitFor(() => expect(screen.getByText('runtime identity 접근 제한')).toBeInTheDocument()); expect(screen.getByText('레지스트리 접근 제한')).toBeInTheDocument();
  });
  test('refreshes runtime and registry after a lifecycle action', async () => {
    const action = jest.fn().mockResolvedValue({}); const refresh = jest.fn().mockResolvedValue({ runtime: { ...runtime, data: { ...runtime.data, modelVersion: 'runtime-v2' } }, registry: { state: 'SUCCESS', data: [] }, history: base.history });
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_VALIDATE'] }, action, refresh)} />); const button = await screen.findByRole('button', { name: 'safe-v1 검증' }); fireEvent.click(button);
    await waitFor(() => expect(refresh).toHaveBeenCalledWith({ permissions: expect.arrayContaining(['MODEL_METRICS_READ']) })); expect(screen.getByText('runtime-v2')).toBeInTheDocument(); expect(screen.getByText('등록된 ModelOps lifecycle 항목 없음')).toBeInTheDocument();
  });
  test('keeps data when an action fails', async () => {
    const action = jest.fn().mockRejectedValue({ code: 'MODEL_PROMOTION_GATE_FAILED' }); render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_VALIDATE'] }, action)} />); const button = await screen.findByRole('button', { name: 'safe-v1 검증' }); fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('MODEL_PROMOTION_GATE_FAILED')); expect(screen.getByText('safe-v1')).toBeInTheDocument();
  });
  test('prevents duplicate lifecycle submissions while an action is pending', async () => {
    let resolveAction; const action = jest.fn(() => new Promise((resolve) => { resolveAction = resolve; }));
    const registry = { state: 'SUCCESS', data: [{ ...base.registry.data[0], version: 'safe-v1' }, { ...base.registry.data[0], id: 2, version: 'safe-v2' }] };
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_VALIDATE'], registry }, action)} />);
    const first = await screen.findByRole('button', { name: 'safe-v1 검증' }); fireEvent.click(first);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1)); fireEvent.click(screen.getByRole('button', { name: 'safe-v2 검증' }));
    expect(action).toHaveBeenCalledTimes(1); resolveAction({}); await waitFor(() => expect(first).not.toBeDisabled());
  });
  test('does not expose registry private references and preserves unavailable history semantics', async () => {
    const registry = { state: 'SUCCESS', data: [{ ...base.registry.data[0], artifactKey: 'private/object', objectKey: 'internal/key', internalPath: '/var/private', secretLike: 'not-for-ui' }] };
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'AUDIT_READ'], registry, history: { state: 'UNAVAILABLE', code: 'MODEL_LIFECYCLE_AUDIT_SCOPE_UNAVAILABLE' } })} />);
    await waitFor(() => expect(screen.getByText('safe-v1')).toBeInTheDocument());
    expect(screen.queryByText(/private\/object|internal\/key|\/var\/private|not-for-ui/)).not.toBeInTheDocument();
    expect(screen.getByText('변경 이력 확인 불가')).toBeInTheDocument(); expect(screen.getByText('MODEL_LIFECYCLE_AUDIT_SCOPE_UNAVAILABLE')).toBeInTheDocument();
  });
});

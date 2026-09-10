import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ModelReleasesPage from './ModelReleasesPage';

const runtime = { state: 'SUCCESS', data: { status: 'NORMAL', modelVersion: 'runtime-v1', artifactSha256: 'a'.repeat(64), modelSource: 'verified_active_pointer', loadedAt: '2026-09-01T00:00:00Z', supportedHorizons: [60, 120, 180, 240], supportedQuantities: [1, 2, 3, 4, 5] } };
const model = { id: 1, version: 'safe-v1', state: 'DRAFT', createdAt: '2026-08-31T00:00:00Z', artifactSha256: 'b'.repeat(64), codeCommit: 'abc123', featureSchemaVersion: 'v1' };
const base = { permissions: ['MODEL_RELEASE_READ', 'MODEL_METRICS_READ'], runtime, registry: { state: 'SUCCESS', data: [model] }, history: { state: 'SUCCESS', data: [] } };
function adapterFor(result, action = jest.fn().mockResolvedValue({}), refresh, extras = {}) { return () => ({ load: jest.fn().mockResolvedValue(result), action, refresh, ...extras }); }

describe('ModelReleasesPage', () => {
  test('shows runtime identity and registry lifecycle without batch UI', async () => {
    render(<ModelReleasesPage createAdapter={adapterFor(base)} />); await waitFor(() => expect(screen.getByRole('heading', { name: '모델 버전 관리' })).toBeInTheDocument());
    expect(screen.getByText('runtime-v1')).toBeInTheDocument(); expect(screen.getByText('서빙 반영 미확인')).toBeInTheDocument(); expect(screen.getByText('safe-v1')).toBeInTheDocument(); expect(screen.queryByText('예측 배치')).not.toBeInTheDocument();
  });
  test('does not fail the release page when runtime permission is absent', async () => {
    const result = { ...base, permissions: ['MODEL_RELEASE_READ'], runtime: { state: 'ACCESS_LIMITED', permission: 'MODEL_METRICS_READ' }, registry: { state: 'ACCESS_LIMITED', permission: 'MODEL_METRICS_READ' } };
    render(<ModelReleasesPage createAdapter={adapterFor(result)} />); await waitFor(() => expect(screen.getByText('서빙 모델 식별 정보 접근 제한')).toBeInTheDocument()); expect(screen.getByText('레지스트리 접근 제한')).toBeInTheDocument();
  });
  test('refreshes runtime and registry after a lifecycle action', async () => {
    const action = jest.fn().mockResolvedValue({}); const refresh = jest.fn().mockResolvedValue({ runtime: { ...runtime, data: { ...runtime.data, modelVersion: 'runtime-v2' } }, registry: { state: 'SUCCESS', data: [] }, history: base.history });
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_VALIDATE'] }, action, refresh)} />); const button = await screen.findByRole('button', { name: 'safe-v1 검증' }); fireEvent.click(button);
    await waitFor(() => expect(refresh).toHaveBeenCalledWith({ permissions: expect.arrayContaining(['MODEL_METRICS_READ']) })); expect(screen.getByText('runtime-v2')).toBeInTheDocument(); expect(screen.getByText('등록된 모델 수명주기 항목 없음')).toBeInTheDocument();
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

  test('shows VERIFIED only after activate readback matches version and artifact', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const approved = { ...model, state: 'APPROVED', artifactSha256: 'a'.repeat(64), version: 'runtime-v1' };
    const action = jest.fn().mockResolvedValue({ candidateModelId: 1 });
    const verifyServing = jest.fn().mockResolvedValue({ state: 'VERIFIED', refreshed: { runtime, registry: { state: 'SUCCESS', data: [{ ...approved, state: 'ACTIVE' }] }, history: base.history } });
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_ACTIVATE'], registry: { state: 'SUCCESS', data: [approved] } }, action, undefined, { verifyServing })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'runtime-v1 활성화' }));
    await waitFor(() => expect(screen.getByText('확인됨')).toBeInTheDocument());
    expect(verifyServing).toHaveBeenCalledWith({ candidateModelId: 1, permissions: expect.arrayContaining(['MODEL_ACTIVATE']) });
  });

  test('submits artifact, manifest, evaluations, and registration metadata only with register permission', async () => {
    const register = jest.fn().mockResolvedValue({}); const refresh = jest.fn().mockResolvedValue({ runtime, registry: base.registry, history: base.history });
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_ARTIFACT_REGISTER'] }, undefined, refresh, { register })} />);
    await screen.findByRole('form', { name: '모델 업로드 및 등록' });
    fireEvent.change(screen.getByLabelText('모델 버전'), { target: { value: 'model-v2' } });
    fireEvent.change(screen.getByLabelText('코드 커밋'), { target: { value: 'def456' } });
    fireEvent.change(screen.getByLabelText('데이터 매니페스트 해시'), { target: { value: 'd'.repeat(64) } });
    fireEvent.change(screen.getByLabelText('설정 해시'), { target: { value: 'c'.repeat(64) } });
    fireEvent.change(screen.getByLabelText('피처 스키마'), { target: { value: 'v2' } });
    const artifactFile = new File(['model'], 'model.bin'); const manifestFile = new File(['{}'], 'manifest.json'); const evaluationsFile = new File(['[]'], 'evaluations.json');
    fireEvent.change(screen.getByLabelText('모델 아티팩트'), { target: { files: [artifactFile] } });
    fireEvent.change(screen.getByLabelText('매니페스트'), { target: { files: [manifestFile] } });
    fireEvent.change(screen.getByLabelText('20조합 평가'), { target: { files: [evaluationsFile] } });
    fireEvent.click(screen.getByRole('button', { name: '업로드 및 등록' }));
    await waitFor(() => expect(register).toHaveBeenCalledWith(expect.objectContaining({ artifactFile, manifestFile, evaluationsFile, metadata: expect.objectContaining({ version: 'model-v2', featureSchemaVersion: 'v2' }) })));
    expect(refresh).toHaveBeenCalled();
  });

  test('offers factual runtime reconciliation only when no ACTIVE registry model exists', async () => {
    const action = jest.fn().mockResolvedValue({}); const refresh = jest.fn().mockResolvedValue({ runtime, registry: { state: 'SUCCESS', data: [{ ...model, state: 'ACTIVE' }] }, history: base.history });
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_ACTIVATE'] }, action, refresh)} />);
    fireEvent.click(await screen.findByRole('button', { name: '현재 서빙 모델과 동기화' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ type: 'RECONCILE', id: undefined }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '현재 서빙 모델과 동기화' })).not.toBeInTheDocument());
  });

  test('folds the registry, register, and history blocks by default and keeps the lifecycle counts visible', async () => {
    const history = { state: 'SUCCESS', data: [{ action: 'MODEL_APPROVE', resourceType: 'MODEL', resourceVersion: 'safe-v1', result: 'SUCCESS', reasonCode: null, occurredAt: '2026-09-01T00:00:00Z' }] };
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_ARTIFACT_REGISTER'], history })} />);
    const registry = (await screen.findByRole('heading', { name: '모델 레지스트리' })).closest('details');
    const register = screen.getByRole('heading', { name: '모델 업로드 · 등록' }).closest('details');
    const changes = screen.getByRole('heading', { name: '변경 이력' }).closest('details');
    [registry, register, changes].forEach((block) => expect(block.open).toBe(false));

    // folded summaries still carry the lifecycle counts, so the fold hides no fact
    expect(within(registry.querySelector('summary')).getByText('총 1개')).toBeVisible();
    expect(within(registry.querySelector('summary')).getByText('DRAFT 1')).toBeVisible();
    expect(within(changes.querySelector('summary')).getByText('1건')).toBeVisible();
  });

  test('expands the registry on click and exposes its table and lifecycle actions', async () => {
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, permissions: [...base.permissions, 'MODEL_VALIDATE'] })} />);
    const registry = (await screen.findByRole('heading', { name: '모델 레지스트리' })).closest('details');
    fireEvent.click(registry.querySelector('summary'));
    expect(registry.open).toBe(true);
    expect(within(registry).getByText('safe-v1')).toBeVisible();
    expect(within(registry).getByRole('button', { name: 'safe-v1 검증' })).toBeVisible();
  });

  test('renders safe lifecycle history fields', async () => {
    const history = { state: 'SUCCESS', data: [{ action: 'MODEL_APPROVE', resourceType: 'MODEL', resourceVersion: 'safe-v1', result: 'SUCCESS', reasonCode: null, occurredAt: '2026-09-01T00:00:00Z' }] };
    render(<ModelReleasesPage createAdapter={adapterFor({ ...base, history })} />);
    expect(await screen.findByText('MODEL_APPROVE')).toBeInTheDocument();
    expect(screen.getByText('MODEL')).toBeInTheDocument();
  });
});

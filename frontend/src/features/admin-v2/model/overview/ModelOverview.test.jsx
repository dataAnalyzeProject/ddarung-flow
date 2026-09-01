import { render, screen, waitFor } from '@testing-library/react';
import ModelOverview from './ModelOverview';

function adapterFor(result) { return () => ({ load: jest.fn().mockResolvedValue(result) }); }
const runtime = { state: 'SUCCESS', data: { status: 'NORMAL', modelVersion: 'data-3.1-runtime-pointer', artifactSha256: 'a'.repeat(64), modelSource: 'verified_active_pointer', loadedAt: '2026-09-01T00:00:00Z', supportedHorizons: [60, 120, 180, 240], supportedQuantities: [1, 2, 3, 4, 5] } };
const registry = { state: 'SUCCESS', data: [{ id: 1, version: 'registry-v1', state: 'ACTIVE', createdAt: '2026-08-31T00:00:00Z' }] };

describe('ModelOverview', () => {
  test('keeps the page loading state until independent sources resolve', () => {
    render(<ModelOverview createAdapter={() => ({ load: jest.fn(() => new Promise(() => {})) })} />);
    expect(screen.getByRole('region', { name: '불러오는 중 상태' })).toBeInTheDocument();
  });
  test('shows the exact live runtime identity independently of registry lifecycle', async () => {
    render(<ModelOverview createAdapter={adapterFor({ runtime, registry, registryStateCounts: { DRAFT: 0, VALIDATED: 0, APPROVED: 0, ACTIVE: 1, RETIRED: 0 } })} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'data-3.1-runtime-pointer' })).toBeInTheDocument());
    expect(screen.getByText('LIVE INFERENCE')).toBeInTheDocument(); expect(screen.getByText('aaaaaaaaaaaa')).toBeInTheDocument(); expect(screen.getByLabelText('레지스트리 ACTIVE')).toHaveTextContent('1');
  });
  test('keeps runtime unknown when it is unavailable even with a registry result', async () => {
    render(<ModelOverview createAdapter={adapterFor({ runtime: { state: 'ERROR', error: { code: 'MODEL_RUNTIME_UNAVAILABLE' } }, registry, registryStateCounts: { DRAFT: 0, VALIDATED: 0, APPROVED: 0, ACTIVE: 1, RETIRED: 0 } })} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'UNKNOWN' })).toBeInTheDocument()); expect(screen.getByText('MODEL_RUNTIME_UNAVAILABLE')).toBeInTheDocument(); expect(screen.getByLabelText('레지스트리 ACTIVE')).toBeInTheDocument();
  });
  test('does not turn an empty registry into zero-card emphasis', async () => {
    render(<ModelOverview createAdapter={adapterFor({ runtime, registry: { state: 'SUCCESS', data: [] }, registryStateCounts: { DRAFT: 0, VALIDATED: 0, APPROVED: 0, ACTIVE: 0, RETIRED: 0 } })} />);
    await waitFor(() => expect(screen.getByText('등록된 ModelOps lifecycle 항목 없음')).toBeInTheDocument()); expect(screen.queryByLabelText('레지스트리 DRAFT')).not.toBeInTheDocument();
  });
  test('renders registry access denial without hiding a successful runtime', async () => {
    render(<ModelOverview createAdapter={adapterFor({ runtime, registry: { state: 'FORBIDDEN', error: { code: 'ADMIN_PERMISSION_DENIED' } }, registryStateCounts: null })} />);
    await waitFor(() => expect(screen.getByText('data-3.1-runtime-pointer')).toBeInTheDocument()); expect(screen.getByText(/필요 권한: MODEL_METRICS_READ/)).toBeInTheDocument();
  });
  test('keeps registry errors independent and preserves navigation contracts', async () => {
    render(<ModelOverview createAdapter={adapterFor({ runtime, registry: { state: 'ERROR', error: { code: 'MODEL_REGISTRY_RESPONSE_INVALID' } }, registryStateCounts: null })} />);
    await waitFor(() => expect(screen.getByText('MODEL_REGISTRY_RESPONSE_INVALID')).toBeInTheDocument());
    expect(screen.getByText('data-3.1-runtime-pointer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '모델 검증' })).toHaveAttribute('href', '/admin/models/performance');
    expect(screen.getByRole('link', { name: '모델 버전 관리' })).toHaveAttribute('href', '/admin/models/releases');
  });
});

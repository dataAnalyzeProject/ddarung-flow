import { render, screen, waitFor } from '@testing-library/react';
import ModelOverview from './ModelOverview';
import OverviewRoute from './index.jsx';

function adapterFor(result) { return () => ({ load: jest.fn(() => Promise.resolve(result)) }); }
function rejectedAdapter(error) { return () => ({ load: jest.fn(() => Promise.reject(error)) }); }

const success = {
  models: [{ id: 1, version: 'model-public', state: 'VALIDATED', createdAt: '2026-08-31T00:00:00Z' }],
  registryStateCounts: { DRAFT: 2, VALIDATED: 1, APPROVED: 3, ACTIVE: 1, RETIRED: 4 },
};

describe('ModelOverview', () => {
  test('keeps the MODEL-01 identity visible while the source registry is loading', () => {
    render(<ModelOverview createAdapter={() => ({ load: jest.fn(() => new Promise(() => {})) })} />);
    expect(screen.getByText('UI-MODEL-01')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '불러오는 중 상태' })).toBeInTheDocument();
  });

  test('renders UNKNOWN as a non-alarmist runtime limitation and keeps registry ACTIVE distinct', async () => {
    render(<ModelOverview createAdapter={adapterFor(success)} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '모델 운영 현황' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'UNKNOWN' })).toBeInTheDocument();
    expect(screen.getByLabelText('레지스트리 ACTIVE')).toHaveTextContent('1');
    expect(screen.getAllByText(/runtime.*serving.*readback source/i)).toHaveLength(2);
    expect(screen.queryByText(/현재 서비스 중|latest/i)).not.toBeInTheDocument();
  });

  test('renders source-backed zero counts for an empty registry list', async () => {
    render(<ModelOverview createAdapter={adapterFor({ models: [], registryStateCounts: { DRAFT: 0, VALIDATED: 0, APPROVED: 0, ACTIVE: 0, RETIRED: 0 } })} />);
    await waitFor(() => expect(screen.getByLabelText('레지스트리 DRAFT')).toHaveTextContent('0'));
    expect(screen.getByText('총 0개')).toBeInTheDocument();
  });

  test('renders the common forbidden panel for the route permission', async () => {
    render(<ModelOverview createAdapter={rejectedAdapter({ status: 403, code: 'ADMIN_PERMISSION_DENIED' })} />);
    await waitFor(() => expect(screen.getByText(/필요 권한: MODEL_METRICS_READ/)).toBeInTheDocument());
    expect(screen.queryByLabelText('레지스트리 ACTIVE')).not.toBeInTheDocument();
  });

  test('renders an error without replacing unavailable data with zero counts', async () => {
    render(<ModelOverview createAdapter={rejectedAdapter({ status: 500, code: 'MODEL_REGISTRY_API_ERROR' })} />);
    await waitFor(() => expect(screen.getByText('MODEL_REGISTRY_API_ERROR')).toBeInTheDocument());
    expect(screen.queryByText('총 0개')).not.toBeInTheDocument();
  });

  test('the route bridge replaces the placeholder and keeps controller-owned navigation targets declarative', async () => {
    render(<OverviewRoute createAdapter={adapterFor(success)} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '모델 운영 현황' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: '모델 검증' })).toHaveAttribute('href', '/admin/models/performance');
    expect(screen.getByRole('link', { name: '모델 버전 관리' })).toHaveAttribute('href', '/admin/models/releases');
  });
});

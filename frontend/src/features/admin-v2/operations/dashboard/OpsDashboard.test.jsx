import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OpsDashboard from './OpsDashboard';
import OverviewRoute from '../overview/index.jsx';
import { dashboardFixture } from './dashboardFixtures';

function adapterFor(result) { return () => ({ load: jest.fn(() => Promise.resolve(result)) }); }
function deferredAdapter() { const load = jest.fn(() => Promise.resolve(dashboardFixture('SUCCESS'))); return { load, create: () => ({ load }) }; }

describe('OpsDashboard', () => {
  test('renders the canonical context, four summary cards, map, Top 5, and capability-off copy', async () => {
    render(<OpsDashboard createAdapter={adapterFor(dashboardFixture('SUCCESS'))} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument());
    expect(screen.getByText('2026. 8. 30. 오전 9:00:00')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL 대여 부족')).toBeInTheDocument();
    expect(screen.getByText('HIGH 대여 부족')).toBeInTheDocument();
    expect(screen.getByText('WATCH 대여 부족')).toBeInTheDocument();
    expect(screen.getAllByText('데이터 상태')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '우선 확인 Top 5' })).toBeInTheDocument();
    expect(screen.getByText(/반납 위험은 현재 지원되지 않음/)).toBeInTheDocument();
    expect(screen.queryByText(/반납 위험 0건|문제 없음|안정/)).not.toBeInTheDocument();
  });

  test('changes both request context controls and shares selection between list and map', async () => {
    const adapter = deferredAdapter();
    render(<OpsDashboard createAdapter={adapter.create} />);
    await waitFor(() => expect(screen.getByText('광화문역 1번 출구')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('예측 horizon'), { target: { value: '120' } });
    await waitFor(() => expect(adapter.load).toHaveBeenLastCalledWith(expect.objectContaining({ horizonMinutes: 120, requiredBikeCount: 1 })));
    fireEvent.change(screen.getByLabelText('필요 자전거 수'), { target: { value: '3' } });
    await waitFor(() => expect(adapter.load).toHaveBeenLastCalledWith(expect.objectContaining({ horizonMinutes: 120, requiredBikeCount: 3 })));
    fireEvent.click(screen.getByRole('button', { name: /2\. 시청역 7번 출구/ }));
    expect(screen.getByRole('button', { name: /시청역 7번 출구.*1002/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /2\. 시청역 7번 출구/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps overview cards for map permission denial and marks the section forbidden', async () => {
    render(<OpsDashboard createAdapter={adapterFor(dashboardFixture('MAP_FORBIDDEN'))} />);
    await waitFor(() => expect(screen.getByText('CRITICAL 대여 부족')).toBeInTheDocument());
    expect(screen.getAllByText('ADMIN_PERMISSION_DENIED')).toHaveLength(2);
    expect(screen.getByText('일부 정보만 표시합니다. 위험 지도와 Top 5 상태를 확인해 주세요.')).toBeInTheDocument();
  });

  test.each([
    ['MISSING', '현재 화면 상태: PARTIAL (MISSING)'],
    ['DELAYED', '현재 화면 상태: DELAYED'],
    ['INSUFFICIENT_DATA', '현재 화면 상태: INSUFFICIENT_DATA'],
    ['UNAVAILABLE', '현재 화면 상태: UNAVAILABLE'],
    ['EMPTY', '운영 가능한 공개 대여소가 없습니다.'],
  ])('renders %s without fabricating zero values', async (fixture, expected) => {
    render(<OpsDashboard createAdapter={adapterFor(dashboardFixture(fixture))} />);
    await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument());
    expect(screen.queryByText('반납 위험 0건')).not.toBeInTheDocument();
  });

  test('renders a primary error and forbidden primary state', async () => {
    const failure = () => ({ load: () => Promise.reject(Object.assign(new Error('실패'), { status: 403, code: 'ADMIN_ACCESS_DENIED' })) });
    render(<OpsDashboard createAdapter={failure} />);
    await waitFor(() => expect(screen.getByText('ADMIN_ACCESS_DENIED')).toBeInTheDocument());
    expect(screen.getByText('필요 권한: OPS_DASHBOARD_READ')).toBeInTheDocument();
  });

  test('the allowed overview bridge renders the dashboard instead of RoutePlaceholder', async () => {
    render(<OverviewRoute createAdapter={adapterFor(dashboardFixture('SUCCESS'))} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument());
    expect(screen.queryByText('FIXTURE / API_NOT_CONNECTED')).not.toBeInTheDocument();
  });
});

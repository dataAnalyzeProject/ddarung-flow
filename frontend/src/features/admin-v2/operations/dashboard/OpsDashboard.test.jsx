import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OpsDashboard from './OpsDashboard';
import OverviewRoute from '../overview/index.jsx';
import { dashboardFixture } from './dashboardFixtures';
import { loadKakaoMapSdk } from '../../../map/kakaoMapApi';

jest.mock('../../../map/kakaoMapApi', () => ({ loadKakaoMapSdk: jest.fn() }));

function adapterFor(result) { return () => ({ load: jest.fn(() => Promise.resolve(result)) }); }
function deferredAdapter() { const load = jest.fn(() => Promise.resolve(dashboardFixture('SUCCESS'))); return { load, create: () => ({ load }) }; }

describe('OpsDashboard', () => {
  beforeEach(() => loadKakaoMapSdk.mockImplementation(() => new Promise(() => {})));

  test('keeps the SUCCESS fixture aligned with D5 source truth without fabricated capacity UI', () => {
    const fixture = dashboardFixture('SUCCESS');
    expect(fixture.overview.capabilities).toMatchObject({
      rentalRisk: { available: true, source: 'station_predictions + prediction_batches', reasonCode: null },
      returnRisk: { available: false, source: null, reasonCode: 'RETURN_INFERENCE_NOT_APPROVED' },
      stationCapacity: { available: false, source: null, reasonCode: 'CAPACITY_SOURCE_MISSING' },
      districtMetadata: { available: false, source: null, reasonCode: 'DISTRICT_SOURCE_MISSING' },
      recurrence: { available: true, source: 'station_rhythm_profiles', reasonCode: null },
      usageScale: { available: false, source: null, reasonCode: 'USAGE_HISTORY_SOURCE_MISSING' },
      nearbyAlternatives: { available: false, source: null, reasonCode: 'ALTERNATIVE_RULE_NOT_APPROVED' },
    });
    expect(fixture.overview.ruleVersion).toBe('OPS_RENTAL_RISK_V1');
    expect(fixture.risk.items.every((item) => item.station.capacity === null)).toBe(true);
    const { container } = render(<OpsDashboard createAdapter={adapterFor(fixture)} />);
    return waitFor(() => {
      expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument();
      expect(container).not.toHaveTextContent(/수용량|capacity/i);
    });
  });

  test('renders the canonical context, four summary cards, map, Top 5, and capability-off copy', async () => {
    render(<OpsDashboard createAdapter={adapterFor(dashboardFixture('SUCCESS'))} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '운영 상황판' })).toBeInTheDocument());
    const operationsContext = screen.getByRole('region', { name: '운영 기준' });
    expect(operationsContext).toHaveTextContent('기준시각');
    expect(operationsContext).toHaveTextContent(/2026.*8.*30/);
    expect(screen.getByText('CRITICAL 대여 부족')).toBeInTheDocument();
    expect(screen.getByText('HIGH 대여 부족')).toBeInTheDocument();
    expect(screen.getByText('WATCH 대여 부족')).toBeInTheDocument();
    expect(screen.getAllByText('데이터 상태')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '우선 확인 Top 5' })).toBeInTheDocument();
    expect(screen.getByText(/반납 위험은 현재 지원되지 않음/)).toBeInTheDocument();
    expect(screen.queryByText(/반납 위험 0건|문제 없음|안정/)).not.toBeInTheDocument();
  });

  test('changes both request context controls and preserves selection in the Top 5 list', async () => {
    const adapter = deferredAdapter();
    const { container } = render(<OpsDashboard createAdapter={adapter.create} />);
    await waitFor(() => expect(screen.getByText('광화문역 1번 출구')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('예측 horizon'), { target: { value: '120' } });
    await waitFor(() => expect(adapter.load).toHaveBeenLastCalledWith(expect.objectContaining({ horizonMinutes: 120, requiredBikeCount: 1 })));
    fireEvent.change(screen.getByLabelText('필요 자전거 수'), { target: { value: '3' } });
    await waitFor(() => expect(adapter.load).toHaveBeenLastCalledWith(expect.objectContaining({ horizonMinutes: 120, requiredBikeCount: 3 })));
    fireEvent.click(screen.getByRole('button', { name: /2 시청역 7번 출구/ }));
    expect(screen.getByRole('button', { name: /시청역 7번 출구.*1002/ })).toHaveAttribute('aria-current', 'true');
    expect(container.querySelector('.ops-map-marker')).not.toBeInTheDocument();
  });

  test('keeps overview cards for map permission denial and marks the section forbidden', async () => {
    render(<OpsDashboard createAdapter={adapterFor(dashboardFixture('MAP_FORBIDDEN'))} />);
    await waitFor(() => expect(screen.getByText('CRITICAL 대여 부족')).toBeInTheDocument());
    expect(screen.getAllByText('ADMIN_PERMISSION_DENIED')).toHaveLength(2);
    expect(screen.getByText('일부 정보만 표시합니다. 위험 지도와 Top 5 상태를 확인해 주세요.')).toBeInTheDocument();
  });

  test.each([
    ['RISK_DELAYED', '정보 갱신 지연 · DELAYED'],
    ['RISK_MISSING', '일부 데이터 누락 · MISSING'],
  ])('keeps valid risk items visible for independent %s risk data states', async (fixture, notice) => {
    render(<OpsDashboard createAdapter={adapterFor(dashboardFixture(fixture))} />);
    await waitFor(() => expect(screen.getByText('CRITICAL 대여 부족')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '우선 확인 Top 5' })).toBeInTheDocument();
    expect(screen.getAllByText(notice)).toHaveLength(2);
  });

  test.each([
    ['INSUFFICIENT_DATA', '판단에 필요한 정보 부족 상태'],
    ['UNAVAILABLE', '현재 사용할 수 없음 상태'],
  ])('renders the %s risk panel when its response has no items', async (fixture, stateLabel) => {
    render(<OpsDashboard createAdapter={adapterFor(dashboardFixture(fixture))} />);
    await waitFor(() => expect(screen.getAllByRole('region', { name: stateLabel })).toHaveLength(2));
  });

  test('renders an empty risk response as empty', async () => {
    render(<OpsDashboard createAdapter={adapterFor(dashboardFixture('EMPTY'))} />);
    await waitFor(() => expect(screen.getAllByText('현재 조건에서 표시할 위험 대여소가 없습니다.')).toHaveLength(2));
  });

  test('preserves API predictionTargetAt as the Top 5 time attribute without recalculation', async () => {
    const fixture = dashboardFixture('SUCCESS');
    const target = '2026-08-30T13:45:00+09:00';
    fixture.risk.items[0].predictionTargetAt = target;
    const { container } = render(<OpsDashboard createAdapter={adapterFor(fixture)} />);
    await waitFor(() => expect(container.querySelector(`time[datetime="${target}"]`)).toBeInTheDocument());
    expect(container.querySelector(`time[datetime="${target}"]`)).toHaveTextContent('예측 대상');
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

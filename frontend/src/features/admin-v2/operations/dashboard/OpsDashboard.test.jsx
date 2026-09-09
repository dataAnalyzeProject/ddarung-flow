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
      rentalRisk: { available: true, source: 'private_background_global_inference', reasonCode: null },
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
    expect(screen.getAllByText(/LOW 111/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Coverage · active 120곳 · eligible 116곳 · evaluated 116곳 · normal 116곳/)).toBeInTheDocument();
    expect(screen.getAllByText('데이터 상태')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '대여 부족 확률 상위 5곳' })).toBeInTheDocument();
    expect(screen.getByText('서울 전체 정상 평가 대여소 중 60분 후 1대 이상을 확보하지 못할 확률이 높은 5곳입니다. 동률은 대여소 번호순입니다.')).toBeInTheDocument();
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
    expect(screen.getByText('서울 전체 정상 평가 대여소 중 120분 후 3대 이상을 확보하지 못할 확률이 높은 5곳입니다. 동률은 대여소 번호순입니다.')).toBeInTheDocument();
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
    ['RISK_DELAYED', '정보 갱신 지연 · 갱신 지연'],
    ['RISK_MISSING', '일부 데이터 누락 · 재고 일부 확인 불가'],
  ])('keeps valid risk items visible for independent %s risk data states', async (fixture, notice) => {
    const { container } = render(<OpsDashboard createAdapter={adapterFor(dashboardFixture(fixture))} />);
    await waitFor(() => expect(screen.getByText('CRITICAL 대여 부족')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '대여 부족 확률 상위 5곳' })).toBeInTheDocument();
    expect(screen.getAllByText(notice)).toHaveLength(2);
    expect(container.querySelector('.ops-priority-panel')).not.toHaveTextContent(/\b(?:NORMAL|MISSING|DELAYED)\b/);
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

  test('summarizes partial inventory coverage in operator-friendly Korean and keeps raw evidence in details', async () => {
    const fixture = dashboardFixture('MISSING');
    fixture.overview.globalCoverage = { ...fixture.overview.globalCoverage, activePublicStationCount: 2735, inventoryEligibleCount: 2718, evaluatedCount: 2718, normalInferenceCount: 2718, inventoryMissingCount: 17 };
    fixture.overview.inventoryStateSummary = { normal: 2718, delayed: 0, missing: 17, unavailable: 0 };
    const { container } = render(<OpsDashboard createAdapter={adapterFor(fixture)} />);
    await waitFor(() => expect(screen.getByText('일부 데이터 확인 필요')).toBeInTheDocument());
    expect(screen.getAllByText('일부 데이터 결측')).toHaveLength(2);
    expect(screen.getByText('서울 전체 2,735곳 중 2,718곳은 정상적으로 평가되었습니다. 최신 재고를 확인할 수 없는 17곳은 이번 위험 계산에서 제외되었습니다.')).toBeInTheDocument();
    expect(screen.getByText('2,718곳 정상 평가 · 17곳 재고 확인 불가')).toBeInTheDocument();
    expect(container.querySelector('.ops-status-summary')).not.toHaveTextContent(/PARTIAL|MISSING|Global result|FRESH|generation|Coverage/);
    const details = screen.getByText('상세 상태 보기').closest('details');
    expect(details).toHaveTextContent('현재 화면 상태: PARTIAL (MISSING)');
    expect(details).toHaveTextContent('MISSING 17곳');
    expect(details).toHaveTextContent('FRESH');
    expect(details).toHaveTextContent('generation SUCCESS');
  });

  test('shows normal without an unnecessary missing warning when all source counts are normal', async () => {
    const fixture = dashboardFixture('SUCCESS');
    fixture.overview.inventoryStateSummary = { normal: 120, delayed: 0, missing: 0, unavailable: 0 };
    fixture.overview.globalCoverage = { ...fixture.overview.globalCoverage, activePublicStationCount: 120, inventoryEligibleCount: 120, evaluatedCount: 120, normalInferenceCount: 120, inventoryMissingCount: 0, inventoryDelayedCount: 0, inventoryUnavailableCount: 0 };
    render(<OpsDashboard createAdapter={adapterFor(fixture)} />);
    await waitFor(() => expect(screen.getAllByText('정상').length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('일부 데이터 확인 필요')).not.toBeInTheDocument();
    expect(screen.queryByText('일부 데이터 결측')).not.toBeInTheDocument();
  });

  test.each([
    ['MISSING', '일부 데이터 확인 필요'],
    ['DELAYED', '데이터 갱신 지연'],
    ['INSUFFICIENT_DATA', '판단 정보 부족'],
    ['UNAVAILABLE', '데이터 사용 불가'],
    ['EMPTY', '운영 대상 없음'],
  ])('renders %s without fabricating zero values', async (fixture, expected) => {
    render(<OpsDashboard createAdapter={adapterFor(dashboardFixture(fixture))} />);
    await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0));
    expect(screen.queryByText('반납 위험 0건')).not.toBeInTheDocument();
  });

  test.each(['NOT_GENERATED', 'EXPIRED'])('does not present %s or normal-zero coverage as normal', async (freshness) => {
    const fixture = dashboardFixture('SUCCESS');
    fixture.overview.globalResultId = freshness === 'NOT_GENERATED' ? null : fixture.overview.globalResultId;
    fixture.overview.freshness = { state: freshness };
    fixture.overview.globalCoverage = { ...fixture.overview.globalCoverage, evaluatedCount: 0, normalInferenceCount: 0 };
    fixture.overview.rentalRiskSummary = { ...fixture.overview.rentalRiskSummary, criticalCount: null, highCount: null, watchCount: null, lowCount: null };
    render(<OpsDashboard createAdapter={adapterFor(fixture)} />);
    await waitFor(() => expect(screen.getAllByText('판단 정보 부족').length).toBeGreaterThan(0));
    expect(screen.queryByText('정상')).not.toBeInTheDocument();
    expect(screen.queryByText('일부 데이터 확인 필요')).not.toBeInTheDocument();
  });

  test.each([null, 0])('does not present raw MISSING as normal when the missing count is %s', async (missingCount) => {
    const fixture = dashboardFixture('MISSING');
    fixture.overview.globalCoverage = { ...fixture.overview.globalCoverage, inventoryMissingCount: missingCount };
    render(<OpsDashboard createAdapter={adapterFor(fixture)} />);
    await waitFor(() => expect(screen.getByText('일부 데이터 확인 필요')).toBeInTheDocument());
    expect(screen.getAllByText('일부 데이터 결측')).toHaveLength(2);
    expect(screen.getByText('원본 상태가 결측으로 보고되었습니다. 상세 상태에서 커버리지 수치를 확인해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('정상')).not.toBeInTheDocument();
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

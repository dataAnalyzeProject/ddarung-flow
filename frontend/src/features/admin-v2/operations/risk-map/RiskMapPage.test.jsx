import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RiskMapPage from './RiskMapPage';
import { detailFixture, riskMapFixture } from './riskMapFixtures';

function adapter(name = 'SUCCESS') { return () => ({ loadList: ({ cursor }) => Promise.resolve(riskMapFixture(name, cursor)), loadDetail: (number) => Promise.resolve(detailFixture(number)) }); }
function noMap() { return Promise.reject(new Error('KAKAO_MAP_KEY_MISSING')); }
function readyMap(node, maps, callbacks) { callbacks.onViewportChange('126,37,127,38'); return { setStations: jest.fn(), focusStation: jest.fn(), destroy: jest.fn() }; }

afterEach(() => window.history.replaceState({}, '', '/'));

function makeError(error) { return Object.assign(new Error(error.message || 'error'), error); }

test('keeps the route heading while loading and renders zero inventory without fabricating null probability', async () => {
  window.history.replaceState({}, '', '/admin-v2-preview/ops/risk-map?horizonMinutes=120&requiredBikeCount=2');
  render(<RiskMapPage createDataAdapter={adapter()} loadMapSdk={() => Promise.resolve({})} createMapAdapter={readyMap} />);
  expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument();
  expect(await screen.findByText('현재 0대')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '예측 horizon' }).value).toBe('120');
});

test('selects a public station number and opens detail drawer', async () => {
  render(<RiskMapPage createDataAdapter={adapter()} loadMapSdk={() => Promise.resolve({})} createMapAdapter={readyMap} />);
  const station = await screen.findByRole('button', { name: /광화문역 1번 출구/ });
  fireEvent.click(station);
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  expect(screen.getByRole('dialog')).toHaveClass('admin-v2-drawer--contextual');
  expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
  expect(document.querySelector('.admin-v2-drawer-backdrop')).not.toBeInTheDocument();
  expect(screen.getByText('대여소 번호')).toBeInTheDocument();
});

test('clears the selected station and snapshot context when the map viewport changes', async () => {
  let reportBounds;
  let selectStation;
  const map = { setStations: jest.fn(), focusStation: jest.fn(() => reportBounds('bbox-after-pan')), destroy: jest.fn() };
  const loadList = jest.fn(() => Promise.resolve(riskMapFixture()));
  render(<RiskMapPage
    createDataAdapter={() => ({ loadList, loadDetail: (number) => Promise.resolve(detailFixture(number)) })}
    loadMapSdk={() => Promise.resolve({})}
    createMapAdapter={(node, maps, callbacks) => { reportBounds = callbacks.onViewportChange; selectStation = callbacks.onStationSelect; reportBounds('bbox-initial'); return map; }}
  />);

  await waitFor(() => expect(reportBounds).toBeDefined());
  fireEvent.click(await screen.findByRole('button', { name: /광화문역 1번 출구/ }));
  await screen.findByRole('dialog');
  await waitFor(() => expect(loadList).toHaveBeenCalledWith(expect.objectContaining({ bbox: 'bbox-after-pan' })));
  expect(map.focusStation).toHaveBeenCalledWith(expect.objectContaining({ station: expect.objectContaining({ stationNumber: '1001' }) }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  act(() => selectStation('1002'));
  await screen.findByRole('heading', { name: '시청역 7번 출구' });
  act(() => reportBounds('bbox-after-marker'));
  await waitFor(() => expect(loadList).toHaveBeenCalledWith(expect.objectContaining({ bbox: 'bbox-after-marker' })));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('loads only after a map bounds callback and supports cursor append', async () => {
  render(<RiskMapPage createDataAdapter={adapter('PAGINATED')} loadMapSdk={() => Promise.resolve({})} createMapAdapter={readyMap} />);
  await screen.findByText('더 보기');
  fireEvent.click(screen.getByText('더 보기'));
  await screen.findByText('을지로입구역');
});

test('keeps first-page data and retry cursor when load-more fails', async () => {
  const loadList = jest.fn(({ cursor }) => cursor ? Promise.reject(Object.assign(new Error('failed'), { code: 'LOAD_MORE_FAILED' })) : Promise.resolve(riskMapFixture('PAGINATED')));
  render(<RiskMapPage createDataAdapter={() => ({ loadList, loadDetail: (number) => Promise.resolve(detailFixture(number)) })} loadMapSdk={() => Promise.resolve({})} createMapAdapter={readyMap} />);
  await screen.findByText('더 보기');
  fireEvent.click(screen.getByText('더 보기'));
  await screen.findByText('추가 데이터를 불러오지 못했습니다');
  expect(screen.getByText('광화문역 1번 출구')).toBeInTheDocument();
  expect(screen.queryByText('오류가 발생했습니다')).not.toBeInTheDocument();
  expect(screen.getByText('재시도')).toBeInTheDocument();
});

test('clears an expired snapshot instead of retrying its cursor and offers a fresh scoped query', async () => {
  const loadList = jest.fn(({ cursor }) => cursor
    ? Promise.reject(Object.assign(new Error('expired'), { status: 409, code: 'RISK_SNAPSHOT_EXPIRED' }))
    : Promise.resolve({ ...riskMapFixture('PAGINATED'), snapshotId: 'snapshot-1' }));
  render(<RiskMapPage createDataAdapter={() => ({ loadList, loadDetail: (number) => Promise.resolve(detailFixture(number)) })} loadMapSdk={() => Promise.resolve({})} createMapAdapter={readyMap} />);
  fireEvent.click(await screen.findByText('더 보기'));
  await screen.findByText('분석 결과가 만료되었습니다.');
  expect(screen.queryByText('더 보기')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '현재 지도 범위 다시 분석' }));
  await waitFor(() => expect(loadList).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null, snapshotId: null })));
});

test('renders the backend detail shape including direct N probability fields', async () => {
  render(<RiskMapPage createDataAdapter={adapter()} loadMapSdk={() => Promise.resolve({})} createMapAdapter={readyMap} />);
  fireEvent.click(await screen.findByRole('button', { name: /광화문역 1번 출구/ }));
  await screen.findByText('1대 이상 확률');
  expect(screen.getByText('76% / 부족 24%')).toBeInTheDocument();
  expect(screen.getByText('0대')).toBeInTheDocument();
});

test('keeps the map instance and ignores a stale bbox response after the next viewport change', async () => {
  let reportBounds;
  let resolveFirstBbox;
  const map = { setStations: jest.fn(), focusStation: jest.fn(), destroy: jest.fn() };
  const loadList = jest.fn(({ bbox }) => {
    if (bbox === 'bbox-1') return new Promise((resolve) => { resolveFirstBbox = resolve; });
    return Promise.resolve(riskMapFixture());
  });
  render(<RiskMapPage
    createDataAdapter={() => ({ loadList, loadDetail: (number) => Promise.resolve(detailFixture(number)) })}
    loadMapSdk={() => Promise.resolve({})}
    createMapAdapter={(node, maps, callbacks) => { reportBounds = callbacks.onViewportChange; reportBounds('bbox-initial'); return map; }}
  />);

  await waitFor(() => expect(reportBounds).toBeDefined());
  act(() => reportBounds('bbox-1'));
  await waitFor(() => expect(loadList).toHaveBeenCalledWith(expect.objectContaining({ bbox: 'bbox-1' })));
  const firstBboxCall = loadList.mock.calls.find(([request]) => request.bbox === 'bbox-1')[0];
  act(() => reportBounds('bbox-2'));
  await waitFor(() => expect(loadList).toHaveBeenCalledWith(expect.objectContaining({ bbox: 'bbox-2' })));
  expect(firstBboxCall.signal.aborted).toBe(true);
  expect(map.destroy).not.toHaveBeenCalled();

  act(() => resolveFirstBbox({ ...riskMapFixture(), items: [] }));
  await waitFor(() => expect(screen.getByText('광화문역 1번 출구')).toBeInTheDocument());
});

test('keeps the map mounted on RISK_SCOPE_TOO_LARGE and waits for a narrower viewport', async () => {
  let reportBounds;
  const loadList = jest.fn().mockRejectedValueOnce(Object.assign(new Error('범위가 너무 넓습니다'), { code: 'RISK_SCOPE_TOO_LARGE' })).mockResolvedValueOnce(riskMapFixture());
  const map = { setStations: jest.fn(), focusStation: jest.fn(), destroy: jest.fn() };
  render(<RiskMapPage
    createDataAdapter={() => ({ loadList, loadDetail: (number) => Promise.resolve(detailFixture(number)) })}
    loadMapSdk={() => Promise.resolve({})}
    createMapAdapter={(node, maps, callbacks) => { reportBounds = callbacks.onViewportChange; return map; }}
  />);

  await waitFor(() => expect(reportBounds).toBeDefined());
  expect(screen.getByLabelText('위험 대여소 지도')).toBeInTheDocument();
  expect(screen.getByText(/표시하려는 범위가 커서 현재 지도 확대가 필요합니다/)).toBeInTheDocument();
  expect(screen.getByText(/지도를 확대하면 위험도를 계산합니다/)).toBeInTheDocument();
  expect(screen.queryByText('오류가 발생했습니다')).not.toBeInTheDocument();

  act(() => reportBounds('bbox-zoom'));
  await waitFor(() => expect(loadList).toHaveBeenCalledWith(expect.objectContaining({ bbox: 'bbox-zoom' })));
  await waitFor(() => expect(screen.getByText('광화문역 1번 출구')).toBeInTheDocument());
  expect(screen.getByText('2026-08-30T09:00:00+09:00')).toBeInTheDocument();
  expect(map.setStations).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ station: expect.objectContaining({ stationNumber: '1001' }) })]), null);
  expect(map.destroy).not.toHaveBeenCalled();
});

test('returns FORBIDDEN for 401 and 403 responses', async () => {
  const forbidden = { status: 403, code: 'ADMIN_PERMISSION_DENIED', message: '권한이 없습니다.' };
  render(<RiskMapPage createDataAdapter={() => ({ loadList: () => Promise.reject(makeError(forbidden)), loadDetail: (number) => Promise.resolve(detailFixture(number)) })} loadMapSdk={noMap} />);
  expect(await screen.findByText('접근 권한 없음')).toBeInTheDocument();

  const unauthorized = { status: 401, code: 'ADMIN_ACCESS_UNAVAILABLE', message: '로그인이 필요합니다.' };
  render(<RiskMapPage createDataAdapter={() => ({ loadList: () => Promise.reject(makeError(unauthorized)), loadDetail: (number) => Promise.resolve(detailFixture(number)) })} loadMapSdk={noMap} />);
  expect(await screen.findByText('접근 권한 없음')).toBeInTheDocument();
});

test('keeps generic error panel on 500', async () => {
  render(<RiskMapPage createDataAdapter={() => ({ loadList: () => Promise.reject(makeError({ status: 500, code: 'OPS_RISK_MAP_ERROR', message: '오류가 발생했습니다.' })), loadDetail: (number) => Promise.resolve(detailFixture(number)) })} loadMapSdk={noMap} />);
  expect(await screen.findByText('오류가 발생했습니다')).toBeInTheDocument();
  expect(screen.getByText('OPS_RISK_MAP_ERROR')).toBeInTheDocument();
});

test('handles snapshot expiry without breaking map rendering', async () => {
  render(<RiskMapPage createDataAdapter={adapter('DELAYED')} loadMapSdk={noMap} />);
  expect(await screen.findByText('정보 갱신 지연')).toBeInTheDocument();
  expect(screen.queryByText('오류가 발생했습니다')).not.toBeInTheDocument();
});

test('preserves zero / null / MISSING semantics', async () => {
  const payload = riskMapFixture('MISSING');
  payload.items = payload.items.map((item, index) => {
    if (index !== 0) return { ...item, dataState: 'MISSING' };
    return {
      ...item,
      dataState: 'MISSING',
      station: { ...item.station, currentBikes: null },
      rentalRisk: { ...item.rentalRisk, selectedShortageProbability: null },
    };
  });

  render(<RiskMapPage createDataAdapter={() => ({ loadList: () => Promise.resolve(payload), loadDetail: (number) => Promise.resolve(detailFixture(number)) })} loadMapSdk={noMap} />);
  await screen.findByText(/재고 확인 필요/);
  expect(screen.getAllByText('판단 정보 부족').length).toBeGreaterThan(0);
  expect(screen.getByText('현재 2대')).toBeInTheDocument();
});

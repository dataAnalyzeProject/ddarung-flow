import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RiskMapPage from './RiskMapPage';
import { detailFixture, riskMapFixture } from './riskMapFixtures';

function adapter(name = 'SUCCESS') { return () => ({ loadList: ({ cursor }) => Promise.resolve(riskMapFixture(name, cursor)), loadDetail: (number) => Promise.resolve(detailFixture(number)) }); }
function noMap() { return Promise.reject(new Error('KAKAO_MAP_KEY_MISSING')); }

afterEach(() => window.history.replaceState({}, '', '/'));

test('keeps the route heading while loading and renders zero inventory without fabricating null probability', async () => {
  window.history.replaceState({}, '', '/admin-v2-preview/ops/risk-map?horizonMinutes=120&requiredBikeCount=2');
  render(<RiskMapPage createDataAdapter={adapter()} loadMapSdk={noMap} />);
  expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument();
  await screen.findByText('현재 0대');
  expect(screen.getAllByText('판단 정보 부족').length).toBeGreaterThan(0);
  expect(screen.getByRole('combobox', { name: '예측 horizon' }).value).toBe('120');
});

test('selects a public station number and opens detail drawer', async () => {
  render(<RiskMapPage createDataAdapter={adapter()} loadMapSdk={noMap} />);
  const station = await screen.findByRole('button', { name: /광화문역 1번 출구/ });
  fireEvent.click(station);
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  expect(screen.getByRole('dialog')).toHaveClass('admin-v2-drawer--contextual');
  expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
  expect(document.querySelector('.admin-v2-drawer-backdrop')).not.toBeInTheDocument();
  expect(screen.getByText('대여소 번호')).toBeInTheDocument();
});

test('keeps the selected station drawer open when focusing it refreshes the map viewport', async () => {
  let reportBounds;
  let selectStation;
  const map = { setStations: jest.fn(), focusStation: jest.fn(() => reportBounds('bbox-after-pan')), destroy: jest.fn() };
  const loadList = jest.fn(() => Promise.resolve(riskMapFixture()));
  render(<RiskMapPage
    createDataAdapter={() => ({ loadList, loadDetail: (number) => Promise.resolve(detailFixture(number)) })}
    loadMapSdk={() => Promise.resolve({})}
    createMapAdapter={(node, maps, callbacks) => { reportBounds = callbacks.onViewportChange; selectStation = callbacks.onStationSelect; return map; }}
  />);

  await waitFor(() => expect(reportBounds).toBeDefined());
  fireEvent.click(await screen.findByRole('button', { name: /광화문역 1번 출구/ }));
  await screen.findByRole('dialog');
  await waitFor(() => expect(loadList).toHaveBeenCalledWith(expect.objectContaining({ bbox: 'bbox-after-pan' })));
  expect(map.focusStation).toHaveBeenCalledWith(expect.objectContaining({ station: expect.objectContaining({ stationNumber: '1001' }) }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('대여소 번호')).toBeInTheDocument();

  act(() => selectStation('1002'));
  await screen.findByRole('heading', { name: '시청역 7번 출구' });
  act(() => reportBounds('bbox-after-marker'));
  await waitFor(() => expect(loadList).toHaveBeenCalledWith(expect.objectContaining({ bbox: 'bbox-after-marker' })));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('keeps the list available when map provider fails and supports cursor append', async () => {
  render(<RiskMapPage createDataAdapter={adapter('PAGINATED')} loadMapSdk={noMap} />);
  await screen.findByText('더 보기');
  await screen.findByText(/지도 사용 불가/);
  fireEvent.click(screen.getByText('더 보기'));
  await screen.findByText('을지로입구역');
});

test('keeps first-page data and retry cursor when load-more fails', async () => {
  const loadList = jest.fn(({ cursor }) => cursor ? Promise.reject(Object.assign(new Error('failed'), { code: 'LOAD_MORE_FAILED' })) : Promise.resolve(riskMapFixture('PAGINATED')));
  render(<RiskMapPage createDataAdapter={() => ({ loadList, loadDetail: (number) => Promise.resolve(detailFixture(number)) })} loadMapSdk={noMap} />);
  await screen.findByText('더 보기');
  fireEvent.click(screen.getByText('더 보기'));
  await screen.findByText('추가 데이터를 불러오지 못했습니다');
  expect(screen.getByText('광화문역 1번 출구')).toBeInTheDocument();
  expect(screen.queryByText('오류가 발생했습니다')).not.toBeInTheDocument();
  expect(screen.getByText('재시도')).toBeInTheDocument();
});

test('renders the backend detail shape including direct N probability fields', async () => {
  render(<RiskMapPage createDataAdapter={adapter()} loadMapSdk={noMap} />);
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
    createMapAdapter={(node, maps, callbacks) => { reportBounds = callbacks.onViewportChange; return map; }}
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

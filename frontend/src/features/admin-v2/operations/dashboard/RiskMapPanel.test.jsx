import { render, screen, waitFor } from '@testing-library/react';
import RiskMapPanel from './RiskMapPanel';

const items = [
  { station: { stationNumber: '1001', name: '광화문역 1번 출구', coordinates: { latitude: 37.571, longitude: 126.976 } }, dataState: 'NORMAL', riskBand: 'CRITICAL' },
  { station: { stationNumber: '1002', name: '시청역 7번 출구', coordinates: { latitude: 37.565, longitude: 126.977 } }, dataState: 'MISSING', riskBand: null },
];

test('loads a mini-map, passes Top 5 items and synchronizes marker callback with stationNumber', async () => {
  const adapter = { setStations: jest.fn(), focusStation: jest.fn(), destroy: jest.fn() };
  const createMapAdapter = jest.fn((_, __, options) => ({ ...adapter, onStationSelect: options.onStationSelect }));
  const onSelect = jest.fn();
  const loadMapSdk = () => Promise.resolve({});
  const { rerender } = render(<RiskMapPanel items={items} selectedStationNumber="1001" onSelect={onSelect} loadMapSdk={loadMapSdk} createMapAdapter={createMapAdapter} />);

  await waitFor(() => expect(createMapAdapter).toHaveBeenCalledTimes(1));
  expect(adapter.setStations).toHaveBeenCalledWith(items, '1001');
  expect(screen.getByRole('link', { name: '전체 수급 위험 지도 보기' })).toHaveAttribute('href', '/admin/ops/risk-map');
  expect(document.querySelector('.ops-map-marker')).not.toBeInTheDocument();
  createMapAdapter.mock.results[0].value.onStationSelect('1002');
  expect(onSelect).toHaveBeenCalledWith('1002');

  rerender(<RiskMapPanel items={items} selectedStationNumber="1002" onSelect={onSelect} loadMapSdk={loadMapSdk} createMapAdapter={createMapAdapter} />);
  await waitFor(() => expect(adapter.focusStation).toHaveBeenCalledWith(items[1]));
  expect(adapter.destroy).not.toHaveBeenCalled();
});

test('contains a map-only failure while retaining the risk context and truthful source state', async () => {
  render(<RiskMapPanel items={items} selectedStationNumber="1001" onSelect={jest.fn()} dataState="MISSING" state="PARTIAL" loadMapSdk={() => Promise.reject(new Error('KAKAO_MAP_KEY_MISSING'))} createMapAdapter={jest.fn()} />);

  expect(screen.getByText('일부 데이터 누락 · MISSING')).toBeInTheDocument();
  expect(await screen.findByText('지도 사용 불가')).toBeInTheDocument();
  expect(screen.getByText('대여소 목록은 계속 확인할 수 있습니다.')).toBeInTheDocument();
});

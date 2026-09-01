import { fireEvent } from '@testing-library/react';
import { createMiniRiskKakaoMapAdapter } from './miniRiskKakaoMapAdapter';

function createMaps() {
  const overlays = [];
  const bounds = [];
  const map = { panTo: jest.fn(), setBounds: jest.fn(), setCenter: jest.fn(), setLevel: jest.fn() };
  const maps = {
    LatLng: function LatLng(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; },
    LatLngBounds: function LatLngBounds() { this.extend = jest.fn(); bounds.push(this); },
    Map: jest.fn(() => map),
    CustomOverlay: function CustomOverlay(options) { this.options = options; this.setMap = jest.fn(); overlays.push(this); },
  };
  return { maps, map, overlays, bounds };
}

const normal = (number, riskBand = 'HIGH') => ({
  station: { stationNumber: number, name: `대여소 ${number}`, coordinates: { latitude: 37.5 + Number(number) / 10000, longitude: 127 + Number(number) / 10000 } },
  dataState: 'NORMAL',
  riskBand,
});

test('creates a real map, positions overlays at source coordinates, and fits multiple stations', () => {
  const { maps, map, overlays } = createMaps();
  const adapter = createMiniRiskKakaoMapAdapter(document.createElement('div'), maps);
  adapter.setStations([normal('1001', 'CRITICAL'), normal('1002', 'LOW')], '1001');

  expect(maps.Map).toHaveBeenCalledTimes(1);
  expect(overlays).toHaveLength(2);
  expect(overlays[0].options.position).toMatchObject({ latitude: 37.6001, longitude: 127.1001 });
  expect(map.setBounds).toHaveBeenCalledTimes(1);
  expect(overlays[0].options.content).toHaveClass('ops-risk-CRITICAL', 'selected');
  expect(overlays[0].options.content).toHaveAttribute('aria-label', '1001 대여소 1001 CRITICAL 대여 부족');
});

test.each([
  ['MISSING', 'HIGH'],
  ['INSUFFICIENT_DATA', 'WATCH'],
  ['UNAVAILABLE', 'LOW'],
  ['NORMAL', null],
])('uses truthful unknown marker semantics for %s / %s', (dataState, riskBand) => {
  const { maps, overlays } = createMaps();
  const adapter = createMiniRiskKakaoMapAdapter(document.createElement('div'), maps);
  adapter.setStations([{ ...normal('1003', riskBand), dataState }]);

  expect(overlays[0].options.content).toHaveTextContent('?');
  expect(overlays[0].options.content).toHaveAttribute('aria-label', '1003 대여소 1003 판단 정보 부족');
});

test('uses stationNumber for marker selection and callback, pans to focused source coordinates, and removes overlays', () => {
  const { maps, map, overlays } = createMaps();
  const onStationSelect = jest.fn();
  const adapter = createMiniRiskKakaoMapAdapter(document.createElement('div'), maps, { onStationSelect });
  const item = normal('1004');
  adapter.setStations([item], '1004');

  fireEvent.click(overlays[0].options.content);
  expect(onStationSelect).toHaveBeenCalledWith('1004');
  expect(overlays[0].options.content).toHaveAttribute('aria-pressed', 'true');
  adapter.focusStation(item);
  expect(map.panTo).toHaveBeenCalledWith(expect.objectContaining({ latitude: 37.6004, longitude: 127.1004 }));
  adapter.destroy();
  expect(overlays[0].setMap).toHaveBeenCalledWith(null);
});

test.each([
  ['null latitude', null, 126.978],
  ['null longitude', 37.5665, null],
  ['undefined latitude', undefined, 126.978],
  ['undefined longitude', 37.5665, undefined],
  ['empty latitude', '', 126.978],
  ['blank longitude', 37.5665, '   '],
  ['boolean latitude', true, 126.978],
  ['non-numeric latitude', 'not-a-number', 126.978],
  ['non-numeric longitude', 37.5665, 'x'],
  ['latitude above range', 91, 126.978],
  ['latitude below range', -91, 126.978],
  ['longitude above range', 37.5665, 181],
  ['longitude below range', 37.5665, -181],
])('skips %s without creating an overlay', (_label, latitude, longitude) => {
  const { maps, overlays } = createMaps();
  const adapter = createMiniRiskKakaoMapAdapter(document.createElement('div'), maps);
  adapter.setStations([{ station: { stationNumber: 'bad', name: '잘못된 좌표', coordinates: { latitude, longitude } }, dataState: 'NORMAL', riskBand: 'HIGH' }]);

  expect(overlays).toHaveLength(0);
});

test('keeps valid Seoul numeric-string coordinates', () => {
  const { maps, overlays } = createMaps();
  const adapter = createMiniRiskKakaoMapAdapter(document.createElement('div'), maps);
  adapter.setStations([{ ...normal('1005'), station: { ...normal('1005').station, coordinates: { latitude: '37.5665', longitude: '126.978' } } }]);

  expect(overlays).toHaveLength(1);
  expect(overlays[0].options.position).toMatchObject({ latitude: 37.5665, longitude: 126.978 });
});

test('uses only valid source coordinates for mixed-list overlays and bounds', () => {
  const { maps, overlays, bounds } = createMaps();
  const onStationSelect = jest.fn();
  const adapter = createMiniRiskKakaoMapAdapter(document.createElement('div'), maps, { onStationSelect });
  const invalidStation = { ...normal('1002'), station: { ...normal('1002').station, coordinates: { latitude: null, longitude: 126.978 } } };

  adapter.setStations([normal('1001'), invalidStation, normal('1003')]);

  expect(overlays).toHaveLength(2);
  expect(bounds).toHaveLength(1);
  expect(bounds[0].extend).toHaveBeenCalledTimes(2);
  expect(overlays.map((overlay) => overlay.options.content.getAttribute('aria-label'))).not.toContain(expect.stringContaining('1002'));
  expect(onStationSelect).not.toHaveBeenCalled();
});

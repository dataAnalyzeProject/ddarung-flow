import { createRiskKakaoMapAdapter } from './riskKakaoMapAdapter';
import { fireEvent } from '@testing-library/react';

function setup() {
  const handlers = {};
  const overlays = [];
  const maps = {
    LatLng: function LatLng(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; },
    Map: function Map() { this.panTo = jest.fn(); this.getBounds = () => ({ getSouthWest: () => ({ getLng: () => 126, getLat: () => 37 }), getNorthEast: () => ({ getLng: () => 127, getLat: () => 38 }) }); },
    CustomOverlay: function CustomOverlay(options) { this.options = options; this.setMap = jest.fn(); overlays.push(this); },
    event: { addListener: jest.fn((_, name, handler) => { handlers[name] = handler; }), removeListener: jest.fn() },
  };
  const selected = jest.fn(); const viewport = jest.fn();
  const adapter = createRiskKakaoMapAdapter(document.createElement('div'), maps, { onStationSelect: selected, onViewportChange: viewport });
  return { adapter, handlers, maps, overlays, selected, viewport };
}

function station(riskBand, dataState = 'NORMAL') {
  return { station: { stationNumber: '1001', name: '테스트', coordinates: { latitude: 37.5, longitude: 127 } }, dataState, riskBand };
}

test.each([
  ['CRITICAL', 'risk-map-marker--critical', 'C'],
  ['HIGH', 'risk-map-marker--high', 'H'],
  ['WATCH', 'risk-map-marker--watch', 'W'],
  ['LOW', 'risk-map-marker--low', 'L'],
])('uses the %s risk semantic class and label', (riskBand, className, label) => {
  const { adapter, overlays } = setup();
  adapter.setStations([station(riskBand)], null);
  expect(overlays[0].options.content).toHaveClass('risk-map-marker', className);
  expect(overlays[0].options.content).toHaveTextContent(label);
  expect(overlays[0].options.content).toHaveAttribute('aria-label', `테스트 1001 ${riskBand}`);
});

test.each([
  [null, 'NORMAL'],
  ['UNSUPPORTED', 'NORMAL'],
  ['LOW', 'MISSING'],
])('uses unknown marker semantics for riskBand %s and dataState %s', (riskBand, dataState) => {
  const { adapter, overlays } = setup();
  adapter.setStations([station(riskBand, dataState)], null);
  expect(overlays[0].options.content).toHaveClass('risk-map-marker--unknown');
  expect(overlays[0].options.content).toHaveTextContent('?');
  expect(overlays[0].options.content).not.toHaveClass('risk-map-marker--low');
});

test('uses stationNumber for marker selection and cleans up overlays', () => {
  const { adapter, handlers, maps, overlays, selected, viewport } = setup();
  adapter.setStations([station('HIGH')], '1001');
  expect(overlays[0].options.content).toHaveClass('risk-map-marker--high', 'selected');
  fireEvent.click(overlays[0].options.content);
  expect(selected).toHaveBeenCalledWith('1001');
  handlers.idle(); expect(viewport).toHaveBeenCalledWith('126,37,127,38');
  adapter.focusStation({ station: { coordinates: { latitude: 37.5, longitude: 127 } } });
  adapter.destroy(); expect(overlays[0].setMap).toHaveBeenCalledWith(null); expect(maps.event.removeListener).toHaveBeenCalledWith(expect.anything(), 'idle', handlers.idle);
});

test('clears existing overlays when stations become empty', () => {
  const { adapter, overlays } = setup();
  adapter.setStations([station('CRITICAL')], null);
  adapter.setStations([], null);
  expect(overlays[0].setMap).toHaveBeenCalledWith(null);
  expect(overlays).toHaveLength(1);
});

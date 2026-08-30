import { createRiskKakaoMapAdapter } from './riskKakaoMapAdapter';
import { fireEvent } from '@testing-library/react';

test('uses stationNumber for marker selection and cleans up overlays', () => {
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
  adapter.setStations([{ station: { stationNumber: '1001', name: '테스트', coordinates: { latitude: 37.5, longitude: 127 } }, dataState: 'NORMAL', riskBand: 'HIGH' }], '1001');
  fireEvent.click(overlays[0].options.content);
  expect(selected).toHaveBeenCalledWith('1001');
  handlers.idle(); expect(viewport).toHaveBeenCalledWith('126,37,127,38');
  adapter.focusStation({ station: { coordinates: { latitude: 37.5, longitude: 127 } } });
  adapter.destroy(); expect(overlays[0].setMap).toHaveBeenCalledWith(null); expect(maps.event.removeListener).toHaveBeenCalledWith(expect.anything(), 'idle', handlers.idle);
});

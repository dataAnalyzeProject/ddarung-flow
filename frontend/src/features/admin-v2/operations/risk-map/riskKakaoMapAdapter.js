function latLng(maps, coordinates) { return new maps.LatLng(coordinates.latitude, coordinates.longitude); }
const MARKER_BY_BAND = {
  CRITICAL: { className: 'riskband-marker--critical', label: 'C' },
  HIGH: { className: 'riskband-marker--high', label: 'H' },
  WATCH: { className: 'riskband-marker--watch', label: 'W' },
  LOW: { className: 'riskband-marker--low', label: 'L' },
};
function markerPresentation(item) {
  if (item.dataState === 'NORMAL' && MARKER_BY_BAND[item.riskBand]) return { ...MARKER_BY_BAND[item.riskBand], ariaRisk: item.riskBand };
  return { className: 'riskband-marker--unknown', label: '?', ariaRisk: item.dataState && item.dataState !== 'NORMAL' ? item.dataState : '판단 정보 부족' };
}
export function createRiskKakaoMapAdapter(container, maps, { onStationSelect, onViewportChange } = {}) { const map = new maps.Map(container, { center: new maps.LatLng(37.5665, 126.978), level: 6 }); let overlays = []; const reportBounds = () => { const bounds = map.getBounds?.(); if (!bounds) return; const sw = bounds.getSouthWest(); const ne = bounds.getNorthEast(); onViewportChange?.(`${sw.getLng()},${sw.getLat()},${ne.getLng()},${ne.getLat()}`); }; maps.event?.addListener?.(map, 'idle', reportBounds); const clear = () => { overlays.forEach((overlay) => overlay.setMap(null)); overlays = []; }; return { setStations(items, selectedStationNumber) { clear(); items.filter((item) => item.station?.coordinates).forEach((item) => { const content = document.createElement('button'); const number = item.station.stationNumber; const marker = markerPresentation(item); content.type = 'button'; content.className = `risk-map-marker ${marker.className}${selectedStationNumber === number ? ' selected' : ''}`; content.textContent = marker.label; content.setAttribute('aria-label', `${item.station.name} ${number} ${marker.ariaRisk}`); content.addEventListener('click', () => onStationSelect?.(number)); overlays.push(new maps.CustomOverlay({ map, position: latLng(maps, item.station.coordinates), content, yAnchor: 1 })); }); }, focusStation(item) { if (item?.station?.coordinates) map.panTo(latLng(maps, item.station.coordinates)); }, destroy() { clear(); maps.event?.removeListener?.(map, 'idle', reportBounds); } }; }

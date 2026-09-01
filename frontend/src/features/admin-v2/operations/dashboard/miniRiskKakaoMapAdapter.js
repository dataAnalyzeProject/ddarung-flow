function parseCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum ? coordinate : null;
}

function isValidCoordinates(coordinates) {
  return Boolean(coordinates)
    && parseCoordinate(coordinates.latitude, -90, 90) !== null
    && parseCoordinate(coordinates.longitude, -180, 180) !== null;
}

function toLatLng(maps, coordinates) {
  return new maps.LatLng(Number(coordinates.latitude), Number(coordinates.longitude));
}

function markerMeaning(item) {
  if (item.dataState !== 'NORMAL' || !item.riskBand) {
    return { className: 'unknown', label: '?', text: '판단 정보 부족' };
  }

  return { className: item.riskBand, label: item.riskBand, text: `${item.riskBand} 대여 부족` };
}

export function createMiniRiskKakaoMapAdapter(container, maps, { onStationSelect } = {}) {
  const map = new maps.Map(container, { center: new maps.LatLng(37.5665, 126.978), level: 6 });
  let overlays = [];

  const clearOverlays = () => {
    overlays.forEach((overlay) => overlay.setMap(null));
    overlays = [];
  };

  const focus = (item) => {
    if (!isValidCoordinates(item?.station?.coordinates)) return;
    map.panTo?.(toLatLng(maps, item.station.coordinates));
  };

  return {
    setStations(items = [], selectedStationNumber) {
      clearOverlays();
      const validItems = items.filter((item) => isValidCoordinates(item?.station?.coordinates));

      validItems.forEach((item) => {
        const number = item.station.stationNumber;
        const meaning = markerMeaning(item);
        const content = document.createElement('button');
        content.type = 'button';
        content.className = `ops-mini-risk-marker ops-risk-${meaning.className}${selectedStationNumber === number ? ' selected' : ''}`;
        content.textContent = meaning.label;
        content.setAttribute('aria-label', `${number} ${item.station.name} ${meaning.text}`);
        content.setAttribute('aria-pressed', selectedStationNumber === number ? 'true' : 'false');
        content.addEventListener('click', () => onStationSelect?.(number));
        overlays.push(new maps.CustomOverlay({ map, position: toLatLng(maps, item.station.coordinates), content, yAnchor: 1 }));
      });

      if (validItems.length > 1 && maps.LatLngBounds) {
        const bounds = new maps.LatLngBounds();
        validItems.forEach((item) => bounds.extend(toLatLng(maps, item.station.coordinates)));
        map.setBounds?.(bounds);
      } else if (validItems.length === 1) {
        const position = toLatLng(maps, validItems[0].station.coordinates);
        map.setCenter?.(position);
        map.setLevel?.(5);
      }
    },
    focusStation: focus,
    destroy() {
      clearOverlays();
    },
  };
}

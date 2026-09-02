import { loadKakaoMapSdk } from "../../../map/kakaoMapApi.js";

function point(maps, value) {
  return new maps.LatLng(Number(value.latitude), Number(value.longitude));
}

function markerContent({ label, onSelect, selected, tone }) {
  const wrap = document.createElement("div");
  wrap.className = `cr22-ride-map-marker cr22-ride-map-marker--${tone}${selected ? " is-selected" : ""}`;
  const marker = document.createElement(onSelect ? "button" : "span");
  if (onSelect) marker.type = "button";
  marker.textContent = label;
  marker.setAttribute("aria-label", `${label} 지도 위치`);
  if (onSelect) marker.addEventListener("click", onSelect);
  wrap.appendChild(marker);
  return wrap;
}

export async function createRideMapAdapter(container, { onSelectPoi } = {}) {
  const maps = await loadKakaoMapSdk();
  const map = new maps.Map(container, { center: new maps.LatLng(37.544, 127.056), level: 5 });
  let overlays = [];
  let routeLine = null;

  const clear = () => {
    overlays.forEach((overlay) => overlay.setMap(null));
    overlays = [];
    routeLine?.setMap(null);
    routeLine = null;
  };

  return {
    setData({ pois = [], route, selectedPoi, station }) {
      clear();
      const bounds = maps.LatLngBounds ? new maps.LatLngBounds() : null;
      let boundsCount = 0;
      if (station) {
        const position = point(maps, station);
        overlays.push(new maps.CustomOverlay({ map, position, yAnchor: 1.15, content: markerContent({ label: station.name, tone: "station" }) }));
        bounds?.extend(position);
        boundsCount += 1;
      }
      pois.forEach((poi) => {
        const position = point(maps, poi);
        overlays.push(new maps.CustomOverlay({
          map,
          position,
          yAnchor: 1.15,
          content: markerContent({ label: poi.name, onSelect: () => onSelectPoi?.(poi), selected: poi.placeId === selectedPoi?.placeId, tone: "poi" }),
        }));
        bounds?.extend(position);
        boundsCount += 1;
      });
      if (Array.isArray(route?.pathPoints) && route.pathPoints.length >= 2 && maps.Polyline) {
        const path = route.pathPoints.map((item) => point(maps, item));
        routeLine = new maps.Polyline({ map, path, strokeColor: "#009c99", strokeOpacity: 0.95, strokeStyle: "solid", strokeWeight: 6, zIndex: 10 });
        path.forEach((position) => { bounds?.extend(position); boundsCount += 1; });
      }
      if (bounds && boundsCount > 1) map.setBounds(bounds);
      else if (station) map.setCenter(point(maps, station));
    },
    destroy: clear,
  };
}

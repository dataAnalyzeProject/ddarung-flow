export default function MapListLayout({ map, list }) {
  return <section className="admin-v2-map-list" aria-label="지도와 목록"><div>{map}</div><div>{list}</div></section>;
}

export default function DataQualityBadge({ state = 'FIXTURE' }) {
  return <span className="admin-v2-badge" aria-label={`데이터 품질: ${state}`}>데이터 품질: {state}</span>;
}

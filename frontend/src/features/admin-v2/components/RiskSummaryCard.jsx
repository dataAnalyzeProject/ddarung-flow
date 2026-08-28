export default function RiskSummaryCard({ label = '위험 요약', state = 'FIXTURE' }) {
  return <section className="admin-v2-card" aria-label={label}><strong>{label}</strong><p>상태: {state}</p></section>;
}

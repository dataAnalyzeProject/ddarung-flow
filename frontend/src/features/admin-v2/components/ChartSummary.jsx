export function ChartSummary({ title, summary }) {
  return <section className="admin-v2-card" aria-label={title}><strong>{title}</strong><p>{summary}</p></section>;
}

export function TableAlternative({ title, children }) {
  return <section aria-label={`${title} 표 대안`}><h2>{title} 표 대안</h2>{children}</section>;
}

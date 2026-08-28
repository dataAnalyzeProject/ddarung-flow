export default function ReferenceTimeBar({ generatedAt }) {
  return <p className="admin-v2-reference-time">기준 시각: {generatedAt || '알 수 없음'} · FIXTURE</p>;
}

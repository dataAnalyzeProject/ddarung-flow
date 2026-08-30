export default function ReferenceTimeBar({ generatedAt, source }) {
  const isPreview = source === 'FIXTURE';

  return <p className="admin-v2-reference-time">
    {isPreview && <span className="admin-v2-preview-badge">미리보기</span>}
    <span>기준 시각: {generatedAt || '알 수 없음'}</span>
  </p>;
}

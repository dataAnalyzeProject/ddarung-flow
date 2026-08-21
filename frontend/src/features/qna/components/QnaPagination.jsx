export default function QnaPagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  return (
    <nav className="qna-pagination" aria-label="질문 페이지">
      <button type="button" aria-label="이전 페이지" disabled={page === 1} onClick={() => onChange(Math.max(1, page - 1))}><span aria-hidden="true">‹</span></button>
      {pages.map((number) => <button type="button" aria-current={page === number ? "page" : undefined} key={number} onClick={() => onChange(number)}>{number}</button>)}
      <button type="button" aria-label="다음 페이지" disabled={page === totalPages} onClick={() => onChange(Math.min(totalPages, page + 1))}><span aria-hidden="true">›</span></button>
    </nav>
  );
}

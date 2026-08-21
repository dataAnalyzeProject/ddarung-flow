export default function QnaQuestionDetail({ question, onBack }) {
  return (
    <section className="qna-detail" aria-labelledby="qna-detail-title">
      <button className="qna-back" type="button" onClick={onBack}>목록으로</button>
      <article>
        <span className={`qna-category ${question.category.toLowerCase()}`}>{question.categoryLabel}</span>
        <h1 id="qna-detail-title">{question.title}</h1>
        <p>{question.visibility === "PRIVATE" ? "내 비공개" : "공개"} · {question.createdAt}</p>
        <div>{question.body}</div>
        <section><h2>답변 상태</h2><p>{question.status === "ANSWERED" ? "답변이 완료된 질문입니다." : "아직 답변이 등록되지 않았습니다."}</p></section>
      </article>
    </section>
  );
}


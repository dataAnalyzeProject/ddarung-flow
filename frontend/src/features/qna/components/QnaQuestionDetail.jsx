import { categoryLabelFor } from "../data/qnaOptions";

export default function QnaQuestionDetail({ question, onBack, onEdit, onDelete, errorMessage, loading = false }) {
  if (loading || errorMessage || !question) {
    return (
      <section className="qna-detail" aria-labelledby="qna-detail-title">
        <button className="qna-back" type="button" onClick={onBack}>목록으로</button>
        <article>
          <h1 id="qna-detail-title">질문 상세</h1>
          {loading ? (
            <p role="status">질문을 불러오는 중입니다</p>
          ) : (
            <p role="alert">{errorMessage || "볼 수 없거나 삭제된 질문입니다"}</p>
          )}
        </article>
      </section>
    );
  }

  return (
    <section className="qna-detail" aria-labelledby="qna-detail-title">
      <button className="qna-back" type="button" onClick={onBack}>목록으로</button>
      <article>
        <span className={`qna-category ${question.category.toLowerCase()}`}>{categoryLabelFor(question.category)}</span>
        <h1 id="qna-detail-title">{question.title}</h1>
        <p>{question.visibility === "PRIVATE" ? "내 비공개" : "공개"} · {question.createdAt}</p>
        <div>{question.body}</div>
        <section><h2>답변 상태</h2><p>{question.status === "ANSWERED" ? "답변이 완료된 질문입니다." : "아직 답변이 등록되지 않았습니다."}</p></section>
        {question.isAuthor ? (
          <div className="qna-form-actions" aria-label="작성자 작업">
            <button type="button" onClick={() => onEdit(question)}>수정</button>
            <button type="button" onClick={() => onDelete(question)}>삭제</button>
          </div>
        ) : null}
      </article>
    </section>
  );
}


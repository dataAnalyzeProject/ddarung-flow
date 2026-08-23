import { categoryLabelFor } from "../data/qnaOptions";

export default function QnaQuestionList({ questions, onSelect }) {
  return (
    <section className="qna-list" aria-label="질문 목록">
      {questions.length ? questions.map((question) => (
        <button
          className="qna-card"
          type="button"
          key={question.id}
          onClick={() => onSelect(question)}
          aria-label={`${question.title} 질문 보기`}
        >
          <span className={`qna-category ${question.category.toLowerCase()}`}>
            {categoryLabelFor(question.category)}
          </span>
          {question.visibility === "PRIVATE" && <span className="qna-lock" aria-label="비공개" />}
          <span className="qna-card-copy">
            <strong>{question.title}</strong>
            <small>
              {question.visibility === "PRIVATE" ? "내 비공개" : "공개"}
              <i aria-hidden="true">·</i>
              {question.createdAt}
            </small>
          </span>
          <span className={`qna-status ${question.status === "ANSWERED" ? "answered" : "open"}`}>
            {question.status === "ANSWERED" ? "답변 완료" : "답변 대기"}
          </span>
        </button>
      )) : <p className="qna-empty">조건에 맞는 질문이 없습니다.</p>}
    </section>
  );
}


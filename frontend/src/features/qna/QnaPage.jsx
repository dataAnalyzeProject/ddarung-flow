import { useMemo, useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { qnaFixture } from "./data/qnaFixture";
import "./QnaPage.css";

const CATEGORY_OPTIONS = [
  ["ALL", "전체 분류"],
  ["SERVICE", "서비스 이용"],
  ["PREDICTION", "예측 결과"],
  ["ACCOUNT", "계정"],
];

function QuestionForm({ onCancel, onCreate }) {
  const [category, setCategory] = useState("SERVICE");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("제목과 내용을 모두 입력해 주세요.");
      return;
    }
    onCreate({
      id: `fixture-${Date.now()}`,
      category,
      categoryLabel: CATEGORY_OPTIONS.find(([value]) => value === category)?.[1] || "서비스 이용",
      visibility,
      status: "OPEN",
      title: title.trim(),
      body: body.trim(),
      answer: null,
      authorId: "user-123",
      createdAt: "방금 전",
    });
  };

  return (
    <section className="qna-compose" aria-labelledby="qna-compose-title">
      <div className="qna-compose-heading">
        <div><h1 id="qna-compose-title">질문 작성</h1><p>궁금한 내용을 남겨주시면 확인 후 답변해 드립니다.</p></div>
        <button type="button" onClick={onCancel}>목록으로</button>
      </div>
      <form className="qna-compose-card" onSubmit={submit}>
        {error && <p className="qna-form-error" role="alert">{error}</p>}
        <div className="qna-form-row">
          <label>분류<select aria-label="질문 분류" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORY_OPTIONS.slice(1).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>공개 여부<select aria-label="공개 여부" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PUBLIC">공개</option><option value="PRIVATE">비공개</option></select></label>
        </div>
        <label>제목<input aria-label="질문 제목" maxLength="120" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="제목을 입력하세요" /></label>
        <label>내용<textarea aria-label="질문 내용" maxLength="5000" value={body} onChange={(event) => setBody(event.target.value)} placeholder="내용을 입력하세요" /></label>
        <div className="qna-form-actions"><button type="button" onClick={onCancel}>취소</button><button type="submit">질문 등록</button></div>
      </form>
    </section>
  );
}

export default function QnaPage({ onNavigate }) {
  const [questions, setQuestions] = useState(qnaFixture);
  const [view, setView] = useState("list");
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [answerStatus, setAnswerStatus] = useState("ALL");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);

  const visibleQuestions = useMemo(() => questions.filter((question) => {
    const isVisible = question.visibility === "PUBLIC" || question.authorId === "user-123";
    const matchesTab = tab === "all" || question.authorId === "user-123";
    const matchesCategory = category === "ALL" || question.category === category;
    const matchesStatus = answerStatus === "ALL" || question.status === answerStatus;
    const searchText = `${question.title} ${question.body}`.toLowerCase();
    return isVisible && matchesTab && matchesCategory && matchesStatus && searchText.includes(submittedQuery.toLowerCase());
  }), [answerStatus, category, questions, submittedQuery, tab]);

  const changeFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const openQuestion = (question) => {
    setSelectedQuestion(question);
    setView("detail");
  };

  const createQuestion = (question) => {
    setQuestions((current) => [question, ...current]);
    setTab("mine");
    setPage(1);
    setView("list");
  };

  return (
    <div className="qna-shell">
      <AppHeader activeRoute="qna" onNavigate={onNavigate} />
      <main className="qna-content">
        {view === "create" ? (
          <QuestionForm onCancel={() => setView("list")} onCreate={createQuestion} />
        ) : view === "detail" && selectedQuestion ? (
          <section className="qna-detail" aria-labelledby="qna-detail-title">
            <button className="qna-back" type="button" onClick={() => setView("list")}>목록으로</button>
            <article>
              <span className={`qna-category ${selectedQuestion.category.toLowerCase()}`}>{selectedQuestion.categoryLabel}</span>
              <h1 id="qna-detail-title">{selectedQuestion.title}</h1>
              <p>{selectedQuestion.visibility === "PRIVATE" ? "내 비공개" : "공개"} · {selectedQuestion.createdAt}</p>
              <div>{selectedQuestion.body}</div>
              <section><h2>답변</h2><p>{selectedQuestion.answer || "아직 답변이 등록되지 않았습니다."}</p></section>
            </article>
          </section>
        ) : (
          <>
            <section className="qna-title-row">
              <div><h1>Q&amp;A</h1><p>서비스 이용과 예측 결과에 관해 궁금한 점을 확인하세요.</p></div>
              <button className="qna-write" type="button" onClick={() => setView("create")}><span aria-hidden="true" />질문 작성</button>
            </section>

            <form className="qna-search" role="search" onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query.trim()); setPage(1); }}>
              <label className="qna-search-input"><span className="qna-visually-hidden">질문 검색어</span><i aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 내용 검색" /></label>
              <label><span className="qna-visually-hidden">분류</span><select aria-label="분류" value={category} onChange={(event) => changeFilter(setCategory, event.target.value)}>{CATEGORY_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span className="qna-visually-hidden">답변 상태</span><select aria-label="답변 상태" value={answerStatus} onChange={(event) => changeFilter(setAnswerStatus, event.target.value)}><option value="ALL">전체 답변</option><option value="ANSWERED">답변 완료</option><option value="OPEN">답변 대기</option></select></label>
              <button type="submit" className="qna-search-button"><span aria-hidden="true" />검색</button>
            </form>

            <div className="qna-tabs" role="tablist" aria-label="질문 범위">
              <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} type="button" onClick={() => changeFilter(setTab, "all")}>전체 질문</button>
              <button role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : ""} type="button" onClick={() => changeFilter(setTab, "mine")}>내 질문</button>
            </div>

            <section className="qna-list" aria-label="질문 목록">
              {visibleQuestions.length ? visibleQuestions.map((question) => (
                <button className="qna-card" type="button" key={question.id} onClick={() => openQuestion(question)} aria-label={`${question.title} 질문 보기`}>
                  <span className={`qna-category ${question.category.toLowerCase()}`}>{question.categoryLabel}</span>
                  {question.visibility === "PRIVATE" && <span className="qna-lock" aria-label="비공개" />}
                  <span className="qna-card-copy"><strong>{question.title}</strong><small>{question.visibility === "PRIVATE" ? "내 비공개" : "공개"}<i aria-hidden="true">·</i>{question.createdAt}</small></span>
                  <span className={`qna-status ${question.status === "ANSWERED" ? "answered" : "open"}`}>{question.status === "ANSWERED" ? "답변 완료" : "답변 대기"}</span>
                </button>
              )) : <p className="qna-empty">조건에 맞는 질문이 없습니다.</p>}
            </section>

            <nav className="qna-pagination" aria-label="질문 페이지">
              <button type="button" aria-label="이전 페이지" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><span aria-hidden="true">‹</span></button>
              {[1, 2, 3].map((number) => <button type="button" aria-current={page === number ? "page" : undefined} key={number} onClick={() => setPage(number)}>{number}</button>)}
              <button type="button" aria-label="다음 페이지" disabled={page === 3} onClick={() => setPage((current) => Math.min(3, current + 1))}><span aria-hidden="true">›</span></button>
            </nav>
          </>
        )}
      </main>
    </div>
  );
}

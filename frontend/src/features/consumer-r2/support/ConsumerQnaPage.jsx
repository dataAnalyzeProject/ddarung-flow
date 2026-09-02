import { useCallback, useEffect, useRef, useState } from "react";
import { consumerSupportAdapter } from "../adapters/support";
import { ConsumerAppHeader, ConsumerButton, ConsumerContainer, ConsumerR2Theme, StatusBadge } from "../shared";
import "./support.css";

const CATEGORIES = [
  ["ALL", "전체 분류"],
  ["USAGE", "서비스 이용"],
  ["BICYCLE_FAULT", "자전거 고장"],
  ["STATION", "대여소"],
  ["ACCOUNT", "계정"],
  ["LOCATION", "위치"],
  ["PAYMENT", "결제"],
  ["OTHER", "기타"],
];

function QuestionStatus({ status }) {
  const label = status === "ANSWERED" ? "답변 완료" : status === "CLOSED" || status === "HIDDEN" ? "종료" : "답변 대기";
  return <StatusBadge tone={status === "ANSWERED" ? "success" : "neutral"}>{label}</StatusBadge>;
}

function QuestionForm({ initialQuestion, onCancel, onSubmit, submitting }) {
  const [values, setValues] = useState({
    category: initialQuestion?.category || "USAGE",
    visibility: initialQuestion?.visibility || "PUBLIC",
    title: initialQuestion?.title || "",
    body: initialQuestion?.body || "",
  });
  const [error, setError] = useState("");
  const editing = Boolean(initialQuestion);
  function change(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError("");
  }
  function submit(event) {
    event.preventDefault();
    if (!values.title.trim() || !values.body.trim()) {
      setError("제목과 내용을 모두 입력해 주세요.");
      return;
    }
    onSubmit({ ...values, title: values.title.trim(), body: values.body.trim() });
  }
  return (
    <section aria-labelledby="qna-form-title" className="cr22-support__form-view">
      <header className="cr22-support__view-head">
        <div><p className="cr22-support__eyebrow">Q&amp;A</p><h1 id="qna-form-title">{editing ? "질문 수정" : "질문 작성"}</h1><p>문의 내용을 확인한 뒤 답변으로 알려 드립니다.</p></div>
        <ConsumerButton disabled={submitting} onClick={onCancel} variant="ghost">목록으로</ConsumerButton>
      </header>
      <form className="cr22-support__form-card" onSubmit={submit}>
        {error ? <p className="cr22-support__form-error" role="alert">{error}</p> : null}
        <div className="cr22-support__form-row">
          <label>분류<select autoComplete="off" name="category" onChange={change} value={values.category}>{CATEGORIES.slice(1).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>공개 여부<select autoComplete="off" name="visibility" onChange={change} value={values.visibility}><option value="PUBLIC">공개 질문</option><option value="PRIVATE">내 비공개 질문</option></select></label>
        </div>
        <label>제목<input autoComplete="off" maxLength="120" name="title" onChange={change} placeholder="질문 제목을 입력하세요" value={values.title} /></label>
        <label>내용<textarea autoComplete="off" maxLength="5000" name="body" onChange={change} placeholder="궁금한 내용을 자세히 적어 주세요" rows="10" value={values.body} /></label>
        <p className="cr22-support__privacy-note">비공개 질문은 작성자 본인과 관리자만 확인할 수 있습니다.</p>
        <div className="cr22-support__form-actions">
          <ConsumerButton disabled={submitting} onClick={onCancel} variant="secondary">취소</ConsumerButton>
          <ConsumerButton loading={submitting} loadingLabel="저장 중…" type="submit">{editing ? "수정 완료" : "질문 등록"}</ConsumerButton>
        </div>
      </form>
    </section>
  );
}

function QuestionDetail({ deleting, onBack, onDelete, onEdit, question }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteTriggerRef = useRef(null);
  const deleteCancelRef = useRef(null);
  const isAuthor = question.authorId === "mine";
  const canEdit = isAuthor && question.status !== "CLOSED" && question.status !== "HIDDEN";
  useEffect(() => {
    if (confirmingDelete) deleteCancelRef.current?.focus();
  }, [confirmingDelete]);
  function closeDeleteConfirmation() {
    setConfirmingDelete(false);
    window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }
  return (
    <section aria-labelledby="qna-detail-title" className="cr22-support__detail">
      <button className="cr22-support__back" onClick={onBack} type="button">← 질문 목록</button>
      <article className="cr22-support__detail-card">
        <header>
          <div className="cr22-support__meta"><StatusBadge>{question.categoryLabel}</StatusBadge>{question.visibility === "PRIVATE" ? <StatusBadge tone="info">비공개</StatusBadge> : null}<QuestionStatus status={question.status} /></div>
          <h1 id="qna-detail-title">{question.title}</h1>
          <p>{question.visibility === "PRIVATE" ? "내 비공개 질문" : "공개 질문"} · {question.createdAt}</p>
        </header>
        <div className="cr22-support__question-body">{question.body}</div>
        {isAuthor ? <div className="cr22-support__detail-actions">{canEdit ? <ConsumerButton onClick={onEdit} variant="secondary">수정</ConsumerButton> : null}<button className="cr22-button cr22-button--ghost" onClick={() => setConfirmingDelete(true)} ref={deleteTriggerRef} type="button"><span>삭제</span></button></div> : null}
        {confirmingDelete ? <aside aria-labelledby="delete-question-title" className="cr22-support__delete-confirm" onKeyDown={(event) => { if (event.key === "Escape" && !deleting) closeDeleteConfirmation(); }} role="group"><div><strong id="delete-question-title">이 질문을 삭제할까요?</strong><p>삭제한 질문과 답변은 되돌릴 수 없습니다.</p></div><div><button className="cr22-button cr22-button--secondary cr22-button--sm" disabled={deleting} onClick={closeDeleteConfirmation} ref={deleteCancelRef} type="button"><span>취소</span></button><ConsumerButton loading={deleting} loadingLabel="삭제 중…" onClick={onDelete} size="sm">삭제하기</ConsumerButton></div></aside> : null}
        <section aria-labelledby="qna-answer-title" className={`cr22-support__answer${question.answer ? " is-answered" : ""}`}>
          <div><span aria-hidden="true">A</span><h2 id="qna-answer-title">답변</h2></div>
          <p>{question.answer || "아직 답변이 등록되지 않았습니다. 답변이 등록되면 알림으로 알려 드립니다."}</p>
        </section>
      </article>
    </section>
  );
}

export default function ConsumerQnaPage({ adapter = consumerSupportAdapter, authState = "authenticated", initialQuestionId, onNavigate, user }) {
  const [view, setView] = useState("list");
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [scope, setScope] = useState("PUBLIC");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [requestState, setRequestState] = useState("loading");
  const [mutationState, setMutationState] = useState("idle");
  const [message, setMessage] = useState("");
  const headingRef = useRef(null);
  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const mutationRequestIdRef = useRef(0);

  const loadQuestions = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    detailRequestIdRef.current += 1;
    if (authState !== "authenticated") {
      setRequestState(authState === "loading" ? "loading" : "auth-required");
      return;
    }
    setRequestState("loading");
    try {
      const result = await adapter.listQuestions({
        scope,
        query: submittedQuery,
        category,
        status: status === "OPEN" ? "PENDING" : status,
        page,
      });
      if (requestId !== listRequestIdRef.current) return;
      setQuestions(result.items || []);
      const responseSize = Number(result.size) || 20;
      setTotalPages(Math.max(1, Math.ceil((Number(result.total) || 0) / responseSize)));
      setRequestState((result.items || []).length ? "success" : "empty");
    } catch (error) {
      if (requestId !== listRequestIdRef.current) return;
      setRequestState(error.status === 401 ? "auth-required" : "error");
    }
  }, [adapter, authState, category, page, scope, status, submittedQuery]);

  useEffect(() => { if (view === "list") loadQuestions(); }, [loadQuestions, view]);
  useEffect(() => {
    if (authState === "authenticated") return;
    listRequestIdRef.current += 1;
    detailRequestIdRef.current += 1;
    mutationRequestIdRef.current += 1;
    setSelectedQuestion(null);
    setQuestions([]);
    setView("list");
    setMutationState("idle");
    setMessage("");
  }, [authState]);
  useEffect(() => {
    if (authState !== "authenticated" || !initialQuestionId) return undefined;
    listRequestIdRef.current += 1;
    const requestId = ++detailRequestIdRef.current;
    let cancelled = false;
    setRequestState("loading-detail");
    adapter.getQuestion(initialQuestionId).then((detail) => {
      if (!cancelled && requestId === detailRequestIdRef.current) {
        setSelectedQuestion(detail);
        setView("detail");
        setRequestState("success");
      }
    }).catch((error) => {
      if (!cancelled && requestId === detailRequestIdRef.current) setRequestState(error.status === 401 ? "auth-required" : error.status === 404 ? "not-found" : "error");
    });
    return () => { cancelled = true; };
  }, [adapter, authState, initialQuestionId]);
  useEffect(() => { if (view !== "list") headingRef.current?.focus(); }, [view]);

  function resetPage(setter, value) { setter(value); setPage(0); }

  async function openQuestion(question) {
    const requestId = ++detailRequestIdRef.current;
    setRequestState("loading-detail");
    try {
      const detail = await adapter.getQuestion(question.id);
      if (requestId !== detailRequestIdRef.current) return;
      setSelectedQuestion(detail);
      setView("detail");
      setRequestState("success");
    } catch (error) {
      if (requestId !== detailRequestIdRef.current) return;
      setRequestState(error.status === 401 ? "auth-required" : error.status === 404 ? "not-found" : "error");
    }
  }

  async function saveQuestion(values) {
    const requestId = ++mutationRequestIdRef.current;
    setMutationState("saving");
    setMessage("");
    try {
      const saved = selectedQuestion
        ? await adapter.updateQuestion(selectedQuestion.id, values)
        : await adapter.createQuestion(values);
      if (requestId !== mutationRequestIdRef.current) return;
      setSelectedQuestion(saved);
      setView("detail");
      setMutationState("idle");
      setMessage(selectedQuestion ? "질문을 수정했습니다." : "질문을 등록했습니다.");
    } catch (error) {
      if (requestId !== mutationRequestIdRef.current) return;
      setMutationState("idle");
      setMessage(error.status === 401 ? "로그인이 필요합니다." : error.status === 409 ? "답변이 시작된 질문은 수정할 수 없습니다." : "질문을 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function deleteSelected() {
    const requestId = ++mutationRequestIdRef.current;
    setMutationState("deleting");
    try {
      await adapter.deleteQuestion(selectedQuestion.id);
      if (requestId !== mutationRequestIdRef.current) return;
      const shouldMoveToPreviousPage = page > 0 && questions.length <= 1;
      setSelectedQuestion(null);
      if (shouldMoveToPreviousPage) setPage((current) => current - 1);
      setView("list");
      setMutationState("idle");
      setMessage("질문을 삭제했습니다.");
    } catch (error) {
      if (requestId !== mutationRequestIdRef.current) return;
      setMutationState("idle");
      setMessage(error.status === 401 ? "로그인이 필요합니다." : "질문을 삭제하지 못했습니다.");
    }
  }

  const effectiveRequestState = authState === "authenticated" ? requestState : authState === "loading" ? "loading" : "auth-required";
  const listState = effectiveRequestState === "loading" || effectiveRequestState === "loading-detail"
    ? <p className="cr22-support__state" role="status">질문을 불러오는 중입니다…</p>
    : effectiveRequestState === "auth-required"
      ? <section className="cr22-support__state" role="alert"><h2>로그인이 필요합니다</h2><p>내 질문과 비공개 질문은 로그인 후 확인할 수 있습니다.</p><ConsumerButton onClick={() => onNavigate?.("login")}>로그인하기</ConsumerButton></section>
      : effectiveRequestState === "error" || effectiveRequestState === "not-found"
        ? <section className="cr22-support__state cr22-support__state--error" role="alert"><h2>{effectiveRequestState === "not-found" ? "질문을 찾을 수 없습니다" : "질문을 불러오지 못했습니다"}</h2><ConsumerButton onClick={loadQuestions}>다시 시도</ConsumerButton></section>
        : effectiveRequestState === "empty"
          ? <section className="cr22-support__state"><h2>조건에 맞는 질문이 없습니다</h2><p>검색 조건을 바꾸거나 첫 질문을 남겨 보세요.</p></section>
          : <div className="cr22-support__question-list">{questions.map((question) => <button aria-label={`${question.title} 질문 보기`} className="cr22-support__question-row" key={question.id} onClick={() => openQuestion(question)} type="button"><span className="cr22-support__question-category">{question.categoryLabel}</span><span className="cr22-support__question-copy"><strong>{question.title}</strong><small>{question.visibility === "PRIVATE" ? "내 비공개" : "공개"} · {question.createdAt}</small></span><QuestionStatus status={question.status} /><span aria-hidden="true" className="cr22-support__chevron">›</span></button>)}</div>;

  return (
    <ConsumerR2Theme className="cr22-support">
      <ConsumerAppHeader activeItem="qna" authState={authState} onAccount={() => onNavigate?.("mypage")} onLogin={() => onNavigate?.("login")} onNavigate={onNavigate} onNotifications={() => onNavigate?.("alerts")} userName={user?.displayName || user?.name} userTier={user?.tier} />
      <main className="cr22-support__main" id="main-content" ref={headingRef} tabIndex="-1">
        <ConsumerContainer>
          {message ? <p className="cr22-support__notice" role="status">{message}</p> : null}
          {authState === "authenticated" && view === "form" ? <QuestionForm initialQuestion={selectedQuestion} onCancel={() => setView(selectedQuestion ? "detail" : "list")} onSubmit={saveQuestion} submitting={mutationState === "saving"} /> : authState === "authenticated" && view === "detail" && selectedQuestion ? <QuestionDetail deleting={mutationState === "deleting"} onBack={() => { setSelectedQuestion(null); setView("list"); }} onDelete={deleteSelected} onEdit={() => setView("form")} question={selectedQuestion} /> : <>
            <header className="cr22-support__hero"><div><p className="cr22-support__eyebrow">HELP CENTER</p><h1>Q&amp;A</h1><p>서비스 이용 중 궁금한 내용을 찾거나 질문을 남겨 주세요.</p></div><ConsumerButton disabled={authState === "loading"} onClick={() => { if (authState !== "authenticated") { onNavigate?.("login"); return; } setSelectedQuestion(null); setView("form"); }}>질문 작성</ConsumerButton></header>
            <section className="cr22-support__qna-panel" aria-label="질문 찾아보기">
              <form className="cr22-support__search" onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query.trim()); setPage(0); }} role="search"><label className="cr22-support__sr-only" htmlFor="qna-search">질문 검색</label><input autoComplete="off" id="qna-search" name="query" onChange={(event) => setQuery(event.target.value)} placeholder="궁금한 내용을 검색하세요" type="search" value={query} /><ConsumerButton type="submit">검색</ConsumerButton></form>
              <div className="cr22-support__filters"><label>분류<select name="category" onChange={(event) => resetPage(setCategory, event.target.value)} value={category}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>답변 상태<select name="answerStatus" onChange={(event) => resetPage(setStatus, event.target.value)} value={status}><option value="ALL">전체 상태</option><option value="OPEN">답변 대기</option><option value="ANSWERED">답변 완료</option></select></label></div>
              <div className="cr22-support__tabs" role="tablist" aria-label="질문 범위"><button aria-selected={scope === "PUBLIC"} onClick={() => resetPage(setScope, "PUBLIC")} role="tab" type="button">전체 질문</button><button aria-selected={scope === "MINE"} onClick={() => resetPage(setScope, "MINE")} role="tab" type="button">내 질문</button></div>
              {listState}
              {effectiveRequestState === "success" && totalPages > 1 ? <nav aria-label="질문 페이지" className="cr22-support__pagination"><ConsumerButton disabled={page === 0} onClick={() => setPage((current) => current - 1)} size="sm" variant="secondary">이전</ConsumerButton><span>{page + 1} / {totalPages}</span><ConsumerButton disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)} size="sm" variant="secondary">다음</ConsumerButton></nav> : null}
            </section>
          </>}
        </ConsumerContainer>
      </main>
    </ConsumerR2Theme>
  );
}

import { useCallback, useEffect, useState } from "react";
import AppHeader from "../../shared/AppHeader";
import QnaPagination from "./components/QnaPagination";
import QnaQuestionDetail from "./components/QnaQuestionDetail";
import QnaQuestionForm from "./components/QnaQuestionForm";
import QnaQuestionList from "./components/QnaQuestionList";
import QnaSearchFilters from "./components/QnaSearchFilters";
import * as qnaApi from "./qnaApi";
import "./QnaPage.css";

const PAGE_SIZE = 10;

function QnaStatePanel({ kind, message, onRetry }) {
  const isLoginRequired = kind === "login";
  return (
    <section className={`qna-state qna-state-${kind}`} aria-live="polite" role={kind === "error" ? "alert" : "status"}>
      <span aria-hidden="true" />
      <h2>{isLoginRequired ? "로그인이 필요합니다" : kind === "loading" ? "질문을 불러오고 있습니다" : "질문을 불러오지 못했습니다"}</h2>
      <p>{message}</p>
      {isLoginRequired ? <a href="/login">로그인하기</a> : onRetry ? <button type="button" onClick={onRetry}>다시 시도</button> : null}
    </section>
  );
}

export default function QnaPage({ onNavigate }) {
  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState("list");
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [answerStatus, setAnswerStatus] = useState("ALL");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [listState, setListState] = useState("loading");
  const [listMessage, setListMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [detailState, setDetailState] = useState("idle");
  const [detailMessage, setDetailMessage] = useState("");

  useEffect(() => {
    if (view !== "list") return undefined;
    const controller = new AbortController();
    setListState("loading");
    setListMessage("");

    qnaApi.fetchQuestions({
      scope: tab === "mine" ? "MINE" : "PUBLIC",
      category,
      status: answerStatus,
      query: submittedQuery,
      page,
      size: PAGE_SIZE,
      signal: controller.signal,
    }).then((response) => {
      setQuestions(response.items);
      setTotal(response.total);
      setListState("ready");
    }).catch((error) => {
      if (error.name === "AbortError") return;
      setQuestions([]);
      setTotal(0);
      setListState(error.status === 401 ? "login" : "error");
      setListMessage(error.message || "잠시 후 다시 시도해 주세요.");
    });

    return () => controller.abort();
  }, [answerStatus, category, page, reloadKey, submittedQuery, tab, view]);

  const changeFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const openQuestion = useCallback(async (question) => {
    setSelectedQuestion(question);
    setView("detail");
    setDetailState("loading");
    setDetailMessage("");
    try {
      const detail = await qnaApi.fetchQuestion(question.id);
      setSelectedQuestion(detail);
      setDetailState("ready");
    } catch (error) {
      setDetailState(error.status === 401 ? "login" : "error");
      setDetailMessage(error.message || "질문 상세를 불러오지 못했습니다.");
    }
  }, []);

  const createQuestion = async (question) => {
    await qnaApi.createQuestion(question);
    setTab("mine");
    setPage(1);
    setView("list");
    setReloadKey((current) => current + 1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let listContent;
  if (listState === "loading") {
    listContent = <QnaStatePanel kind="loading" message="잠시만 기다려 주세요." />;
  } else if (listState === "login") {
    listContent = <QnaStatePanel kind="login" message={listMessage} />;
  } else if (listState === "error") {
    listContent = <QnaStatePanel kind="error" message={listMessage} onRetry={() => setReloadKey((current) => current + 1)} />;
  } else {
    listContent = <><QnaQuestionList questions={questions} onSelect={openQuestion} /><QnaPagination page={page} totalPages={totalPages} onChange={setPage} /></>;
  }

  return (
    <div className="qna-shell">
      <AppHeader activeRoute="qna" onNavigate={onNavigate} />
      <main className="qna-content">
        {view === "create" ? (
          <QnaQuestionForm onCancel={() => setView("list")} onCreate={createQuestion} />
        ) : view === "detail" ? (
          detailState === "ready" && selectedQuestion ? (
            <QnaQuestionDetail question={selectedQuestion} onBack={() => setView("list")} />
          ) : (
            <div className="qna-detail-state">
              <button className="qna-back" type="button" onClick={() => setView("list")}>목록으로</button>
              <QnaStatePanel
                kind={detailState === "login" ? "login" : detailState === "error" ? "error" : "loading"}
                message={detailMessage || "질문 상세를 확인하고 있습니다."}
                onRetry={detailState === "error" && selectedQuestion ? () => openQuestion(selectedQuestion) : undefined}
              />
            </div>
          )
        ) : (
          <>
            <section className="qna-title-row">
              <div><h1>Q&amp;A</h1><p>서비스 이용과 예측 결과에 관해 궁금한 점을 확인하세요.</p></div>
              <button className="qna-write" type="button" onClick={() => setView("create")}><span aria-hidden="true" />질문 작성</button>
            </section>
            <QnaSearchFilters
              query={query}
              category={category}
              answerStatus={answerStatus}
              onQueryChange={setQuery}
              onCategoryChange={(value) => changeFilter(setCategory, value)}
              onAnswerStatusChange={(value) => changeFilter(setAnswerStatus, value)}
              onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query.trim()); setPage(1); }}
            />
            <div className="qna-tabs" role="tablist" aria-label="질문 범위">
              <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} type="button" onClick={() => changeFilter(setTab, "all")}>전체 질문</button>
              <button role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : ""} type="button" onClick={() => changeFilter(setTab, "mine")}>내 질문</button>
            </div>
            {listContent}
          </>
        )}
      </main>
    </div>
  );
}

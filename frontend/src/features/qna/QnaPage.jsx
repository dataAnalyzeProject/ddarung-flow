import { useCallback, useEffect, useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { getCurrentUser, logout } from "../login/authApi";
import * as qnaApi from "./api/qnaApi";
import QnaPagination from "./components/QnaPagination";
import QnaQuestionDetail from "./components/QnaQuestionDetail";
import QnaQuestionForm from "./components/QnaQuestionForm";
import QnaQuestionList from "./components/QnaQuestionList";
import QnaSearchFilters from "./components/QnaSearchFilters";
import "./QnaPage.css";

const PAGE_SIZE = 10;
const ADMIN_ROLE_VALUES = new Set(["ADMIN"]);

function ListState({ kind, message }) {
  if (kind === "auth-required") {
    return (
      <section className="qna-list" aria-label="질문 목록">
        <p className="qna-empty" role="alert">
          {message || "로그인이 필요합니다."} <a href="/login">로그인하기</a>
        </p>
      </section>
    );
  }

  return (
    <section className="qna-list" aria-label="질문 목록">
      <p className="qna-empty" role={kind === "error" ? "alert" : "status"}>{message}</p>
    </section>
  );
}

export default function QnaPage({ onNavigate }) {
  const [questions, setQuestions] = useState([]);
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
  const [detailState, setDetailState] = useState("idle");
  const [detailMessage, setDetailMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [authState, setAuthState] = useState("anonymous");
  const [user, setUser] = useState(null);

  useEffect(() => {
    getCurrentUser()
      .then((auth) => {
        if (!auth.authenticated) {
          setAuthState("anonymous");
          return;
        }
        setUser(auth.user);
        setAuthState("authenticated");
      })
      .catch(() => setAuthState("error"));
  }, []);

  const handleLogout = async () => {
    setAuthState("logging-out");
    try {
      await logout();
      setUser(null);
      setAuthState("anonymous");
    } catch {
      setAuthState("authenticated");
    }
  };

  useEffect(() => {
    if (view !== "list") return undefined;

    const controller = new AbortController();
    setListState("loading");
    setListMessage("");

    qnaApi.listQuestions({
      scope: tab === "mine" ? "MINE" : "PUBLIC",
      category,
      status: answerStatus,
      query: submittedQuery,
      page: page - 1,
      size: PAGE_SIZE,
      signal: controller.signal,
    }).then((response) => {
      setQuestions(response.items || []);
      setListState("ready");
    }).catch((error) => {
      if (error.name === "AbortError") return;
      setQuestions([]);
      setListState(error.status === 401 ? "auth-required" : "error");
      setListMessage(error.message || "질문을 불러오지 못했습니다.");
    });

    return () => controller.abort();
  }, [answerStatus, category, page, reloadKey, submittedQuery, tab, view]);

  const changeFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const returnToList = useCallback(() => {
    setSelectedQuestion(null);
    setDetailState("idle");
    setDetailMessage("");
    setView("list");
  }, []);

  const openQuestion = useCallback(async (question) => {
    setSelectedQuestion(question);
    setDetailState("loading");
    setDetailMessage("");
    setView("detail");

    try {
      const detail = await qnaApi.getQuestion(question.id);
      setSelectedQuestion(detail);
      setDetailState("ready");
    } catch (error) {
      if (error.status === 404) {
        setSelectedQuestion(null);
        setDetailState("not-found");
        setDetailMessage("볼 수 없거나 삭제된 질문입니다");
      } else if (error.status === 401) {
        setSelectedQuestion(null);
        setDetailState("auth-required");
        setDetailMessage(error.message || "로그인이 필요합니다.");
      } else {
        setDetailState("error");
        setDetailMessage(error.message || "질문 상세를 불러오지 못했습니다.");
      }
    }
  }, []);

  const createQuestion = async (question) => {
    await qnaApi.createQuestion(question);
    setTab("mine");
    setPage(1);
    setView("list");
    setReloadKey((current) => current + 1);
  };

  const updateQuestion = async (question) => {
    const updated = await qnaApi.updateQuestion(selectedQuestion.id, question);
    setSelectedQuestion(updated || { ...selectedQuestion, ...question });
    setDetailState("ready");
    setView("detail");
  };

  const deleteQuestion = async (question) => {
    try {
      await qnaApi.deleteQuestion(question.id);
      setTab("mine");
      setPage(1);
      setSelectedQuestion(null);
      setView("list");
      setReloadKey((current) => current + 1);
    } catch (error) {
      setDetailMessage(error.message || "질문을 삭제하지 못했습니다.");
      setDetailState(error.status === 404 ? "not-found" : "error");
      if (error.status === 404) setSelectedQuestion(null);
    }
  };

  let listContent;
  if (listState === "loading") {
    listContent = <ListState kind="loading" message="질문을 불러오는 중입니다" />;
  } else if (listState === "auth-required") {
    listContent = <ListState kind="auth-required" message={listMessage} />;
  } else if (listState === "error") {
    listContent = <ListState kind="error" message={listMessage} />;
  } else {
    listContent = <><QnaQuestionList questions={questions} onSelect={openQuestion} /><QnaPagination page={page} onChange={setPage} /></>;
  }

  let content;
  if (view === "create") {
    content = <QnaQuestionForm onCancel={returnToList} onCreate={createQuestion} />;
  } else if (view === "edit" && selectedQuestion) {
    content = <QnaQuestionForm initialQuestion={selectedQuestion} onCancel={() => setView("detail")} onUpdate={updateQuestion} />;
  } else if (view === "detail") {
    content = (
      <QnaQuestionDetail
        question={detailState === "ready" ? selectedQuestion : null}
        loading={detailState === "loading"}
        errorMessage={detailState !== "loading" && detailState !== "ready" ? detailMessage : ""}
        onBack={returnToList}
        onEdit={(question) => { setSelectedQuestion(question); setView("edit"); }}
        onDelete={deleteQuestion}
      />
    );
  } else {
    content = (
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
    );
  }

  return (
    <div className="qna-shell">
      <AppHeader
        activeRoute="qna"
        authState={authState}
        canEnterAdmin={ADMIN_ROLE_VALUES.has(user?.role)}
        onLogout={handleLogout}
        onNavigate={onNavigate}
        user={user}
      />
      <main className="qna-content">{content}</main>
    </div>
  );
}

import { useMemo, useState } from "react";
import AppHeader from "../../shared/AppHeader";
import { qnaFixture } from "./data/qnaFixture";
import QnaPagination from "./components/QnaPagination";
import QnaQuestionDetail from "./components/QnaQuestionDetail";
import QnaQuestionForm from "./components/QnaQuestionForm";
import QnaQuestionList from "./components/QnaQuestionList";
import QnaSearchFilters from "./components/QnaSearchFilters";
import "./QnaPage.css";

export default function QnaPage({ onNavigate }) {
  const [questions, setQuestions] = useState(qnaFixture); const [view, setView] = useState("list"); const [selectedQuestion, setSelectedQuestion] = useState(null); const [query, setQuery] = useState(""); const [submittedQuery, setSubmittedQuery] = useState(""); const [category, setCategory] = useState("ALL"); const [answerStatus, setAnswerStatus] = useState("ALL"); const [tab, setTab] = useState("all"); const [page, setPage] = useState(1);
  const visibleQuestions = useMemo(() => questions.filter((question) => { const isVisible = question.visibility === "PUBLIC" || question.authorId === "user-123"; const matchesTab = tab === "all" || question.authorId === "user-123"; const matchesCategory = category === "ALL" || question.category === category; const matchesStatus = answerStatus === "ALL" || question.status === answerStatus; return isVisible && matchesTab && matchesCategory && matchesStatus && `${question.title} ${question.body}`.toLowerCase().includes(submittedQuery.toLowerCase()); }), [answerStatus, category, questions, submittedQuery, tab]);
  const changeFilter = (setter, value) => { setter(value); setPage(1); };
  const createQuestion = (question) => { setQuestions((current) => [question, ...current]); setTab("mine"); setPage(1); setView("list"); };
  return <div className="qna-shell"><AppHeader activeRoute="qna" onNavigate={onNavigate} /><main className="qna-content">{view === "create" ? <QnaQuestionForm onCancel={() => setView("list")} onCreate={createQuestion} /> : view === "detail" && selectedQuestion ? <QnaQuestionDetail question={selectedQuestion} onBack={() => setView("list")} /> : <><section className="qna-title-row"><div><h1>Q&amp;A</h1><p>서비스 이용과 예측 결과에 관해 궁금한 점을 확인하세요.</p></div><button className="qna-write" type="button" onClick={() => setView("create")}><span aria-hidden="true" />질문 작성</button></section><QnaSearchFilters query={query} category={category} answerStatus={answerStatus} onQueryChange={setQuery} onCategoryChange={(value) => changeFilter(setCategory, value)} onAnswerStatusChange={(value) => changeFilter(setAnswerStatus, value)} onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query.trim()); setPage(1); }} /><div className="qna-tabs" role="tablist" aria-label="질문 범위"><button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} type="button" onClick={() => changeFilter(setTab, "all")}>전체 질문</button><button role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : ""} type="button" onClick={() => changeFilter(setTab, "mine")}>내 질문</button></div><QnaQuestionList questions={visibleQuestions} onSelect={(question) => { setSelectedQuestion(question); setView("detail"); }} /><QnaPagination page={page} onChange={setPage} /></>}</main></div>;
}

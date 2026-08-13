import { useState } from "react";
import { qnaFixture } from "./data/qnaFixture";
import "./QnaPage.css";
export default function QnaPage({
  view = "list",
  status = "idle",
  questions = qnaFixture,
  selectedQuestion = null,
  currentUser = { id: "user-123", name: "따릉이유저" },
  onSearch,
  onSelect,
  onSubmit,
  onEdit,
  onBack,
  onRetry,
}) {
  // 폼 상태 (작성 / 수정용)
  const [category, setCategory] = useState(selectedQuestion?.category || "GENERAL");
  const [visibility, setVisibility] = useState(selectedQuestion?.visibility || "PUBLIC");
  const [title, setTitle] = useState(selectedQuestion?.title || "");
  const [body, setBody] = useState(selectedQuestion?.body || "");

  // 검색 및 분류 필터 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedAnswerStatus, setSelectedAnswerStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [validationError, setValidationError] = useState("");

  // ACCOUNT, LOCATION 선택 시 PRIVATE 강제
  const handleCategoryChange = (e) => {
    const nextCat = e.target.value;
    setCategory(nextCat);
    if (nextCat === "ACCOUNT" || nextCat === "LOCATION") {
      setVisibility("PRIVATE");
    }
  };
  // 검색 실행
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch({ query: searchQuery.trim(), category: selectedCategory, answerStatus: selectedAnswerStatus, page: page });
    }
  };
  // 작성 / 수정 제출
  const handleSubmitForm = (e) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (trimmedTitle.length < 1 || trimmedTitle.length > 120) {
      setValidationError("제목은 1자 이상 120자 이하로 입력해 주세요.");
      return;
    }
    if (trimmedBody.length < 1 || trimmedBody.length > 5000) {
      setValidationError("본문은 1자 이상 5000자 이하로 입력해 주세요.");
      return;
    }
    setValidationError("");
    const payload = {
      category,
      visibility: (category === "ACCOUNT" || category === "LOCATION") ? "PRIVATE" : visibility,
      title: trimmedTitle,
      body: trimmedBody,
    };
    if (view === "edit" && onEdit) {
      onEdit(payload);
    } else if (onSubmit) {
      onSubmit(payload);
    }
  };
  // 1. 상태(status) 우선 처리 (8가지 상태 분기)
  if (status === "loading") {
    return (
      <main className="qna-page" data-status="loading">
        <header className="qna-page__header">
          <h2>Q&A</h2>
          <p>서비스 이용과 예측 결과에 관해 질문합니다.</p>
        </header>
        <div className="qna-page__skeleton-container">
          <div className="qna-page__skeleton-card" />
          <div className="qna-page__skeleton-card" />
          <div className="qna-page__skeleton-card" />
        </div>
      </main>
    );
  }
  if (status === "empty") {
    return (
      <main className="qna-page" data-status="empty">
        <div className="qna-page__status-card">
          <h3>등록된 질문이 없습니다</h3>
          <p>첫 질문을 작성해 보세요.</p>
          <button type="button" aria-label="질문 작성" onClick={() => onSelect && onSelect({ view: "create" })}>
            질문 작성
          </button>
        </div>
      </main>
    );
  }
  if (status === "error") {
    return (
      <main className="qna-page" data-status="error">
        <div className="qna-page__status-card">
          <h3>질문 목록을 불러오지 못했습니다</h3>
          <p>잠시 후 다시 시도해 주세요.</p>
          <button type="button" aria-label="다시 시도" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }
  if (status === "forbidden") {
    return (
      <main className="qna-page" data-status="forbidden">
        <div className="qna-page__status-card">
          <h3>접근 권한이 없습니다</h3>
        </div>
      </main>
    );
  }
  if (status === "hidden") {
    return (
      <main className="qna-page" data-status="hidden">
        <div className="qna-page__status-card">
          <h3>관리자에 의해 숨겨진 질문입니다</h3>
        </div>
      </main>
    );
  }
  if (status === "notFound") {
    return (
      <main className="qna-page" data-status="notFound">
        <div className="qna-page__status-card">
          <h3>질문을 찾을 수 없거나 비공개 질문입니다</h3>
        </div>
      </main>
    );
  }
  // 2. view === "detail" (상세 보기)
  if (view === "detail" && selectedQuestion) {
    const isOwner = currentUser?.id === selectedQuestion.authorId;
    const isPrivate = selectedQuestion.visibility === "PRIVATE";
    // 🔴 타인의 PRIVATE 질문 진입 시 내용 숨김 및 notFound 상태 렌더링!
    if (isPrivate && !isOwner) {
      return (
        <main className="qna-page" data-status="notFound">
          <div className="qna-page__status-card">
            <h3>질문을 찾을 수 없거나 비공개 질문입니다</h3>
            <p>비공개이거나 삭제된 질문일 수 있습니다.</p>
            <button type="button" aria-label="목록으로 돌아가기" onClick={onBack}>
              목록으로
            </button>
          </div>
        </main>
      );
    }
    const isUnanswered = selectedQuestion.status === "OPEN";
    const canEdit = isOwner && isUnanswered;
    return (
      <main className="qna-page" data-view="detail">
        <button type="button" aria-label="목록으로 돌아가기" onClick={onBack}>
          목록으로
        </button>
        <article className="qna-page__detail">
          <header className="qna-page__detail-header">
            <span className="qna-page__badge qna-page__badge--category">[{selectedQuestion.category}]</span>
            <h2>{selectedQuestion.title}</h2>
            <div className="qna-page__detail-meta">
              <span>{selectedQuestion.visibility === "PRIVATE" ? "비공개" : "공개"}</span>
              <span>{selectedQuestion.createdAt}</span>
              <span>{selectedQuestion.authorName}</span>
            </div>
            {canEdit && (
              <button type="button" aria-label="질문 수정" onClick={() => onSelect && onSelect({ view: "edit", question: selectedQuestion })}>
                수정
              </button>
            )}
          </header>
          <div className="qna-page__detail-body">
            <p>{selectedQuestion.body}</p>
          </div>
          <section className="qna-page__answer-section">
            <h3>답변</h3>
            {selectedQuestion.answer ? (
              <p>{selectedQuestion.answer}</p>
            ) : (
              <p className="qna-page__answer-empty">아직 답변이 등록되지 않았습니다.</p>
            )}
          </section>
        </article>
      </main>
    );
  }
  // 3. view === "create" || view === "edit" (작성 및 수정)
  if (view === "create" || view === "edit") {
    // view="edit" 보안 방어: 타인 질문이거나 이미 답변 완료된 질문이면 직접 진입 차단!
    if (view === "edit") {
      const isOwner = currentUser?.id === selectedQuestion?.authorId;
      const isUnanswered = selectedQuestion?.status === "OPEN";
      if (!isOwner || !isUnanswered) {
        return (
          <main className="qna-page" data-status="forbidden">
            <div className="qna-page__status-card">
              <h3>접근 권한이 없거나 수정할 수 없는 질문입니다</h3>
            </div>
          </main>
        );
      }
    }

    const isAccountOrLocation = category === "ACCOUNT" || category === "LOCATION";
    return (
      <main className="qna-page" data-view={view}>
        <h2>{view === "edit" ? "질문 수정" : "질문 작성"}</h2>
        {validationError && <p className="qna-page__validation-error">{validationError}</p>}
        <form onSubmit={handleSubmitForm} className="qna-page__form">
          <div className="qna-page__form-group">
            <label htmlFor="qna-category">분류</label>
            <select id="qna-category" aria-label="분류" value={category} onChange={handleCategoryChange}>
              <option value="GENERAL">일반</option>
              <option value="FAQ">자주 묻는 질문</option>
              <option value="ACCOUNT">계정 문의</option>
              <option value="LOCATION">위치 문의</option>
            </select>
          </div>
          <div className="qna-page__form-group">
            <label htmlFor="qna-visibility">공개 여부</label>
            <select
              id="qna-visibility"
              aria-label="공개 여부"
              value={isAccountOrLocation ? "PRIVATE" : visibility}
              disabled={isAccountOrLocation}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="PUBLIC">공개</option>
              <option value="PRIVATE">비공개</option>
            </select>
            {isAccountOrLocation && (
              <p className="qna-page__info-text">계정 및 위치 문의는 개인정보 보호를 위해 비공개로 강제 설정됩니다.</p>
            )}
          </div>
          <div className="qna-page__form-group">
            <label htmlFor="qna-title">제목</label>
            <input
              id="qna-title"
              type="text"
              aria-label="제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요 (1~120자)"
            />
          </div>
          <div className="qna-page__form-group">
            <label htmlFor="qna-body">본문</label>
            <textarea
              id="qna-body"
              aria-label="본문"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="내용을 입력하세요 (1~5000자)"
            />
          </div>
          <div className="qna-page__form-actions">
            <button type="button" aria-label="취소" onClick={onBack}>
              취소
            </button>
            <button type="submit" aria-label={view === "edit" ? "저장" : "등록"}>
              {view === "edit" ? "저장" : "등록"}
            </button>
          </div>
        </form>
      </main>
    );
  }
  // 4. view === "list" (기본 질문 목록)
  const visibleQuestions = questions.filter((item) => {
    if (item.visibility === "PUBLIC") return true;
    return item.visibility === "PRIVATE" && item.authorId === currentUser?.id;
  });

  return (
    <main className="qna-page" data-view="list">
      <header className="qna-page__header">
        <h2>Q&A</h2>
        <p>서비스 이용과 예측 결과에 관해 질문합니다.</p>
        <button type="button" aria-label="질문 작성" onClick={() => onSelect && onSelect({ view: "create" })}>
          질문 작성
        </button>
      </header>
      {/* 검색 및 필터 영역 */}
      <form onSubmit={handleSearchSubmit} className="qna-page__search-bar">
        <label htmlFor="qna-search-input">검색</label>
        <input
          id="qna-search-input"
          type="text"
          aria-label="검색어 입력"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="제목 또는 내용 검색"
        />
        <label htmlFor="qna-filter-category">분류</label>
        <select
          id="qna-filter-category"
          aria-label="분류 필터"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="ALL">전체</option>
          <option value="GENERAL">일반</option>
          <option value="FAQ">자주 묻는 질문</option>
          <option value="ACCOUNT">계정 문의</option>
          <option value="LOCATION">위치 문의</option>
        </select>

        <label htmlFor="qna-filter-status">답변 상태</label>
        <select
          id="qna-filter-status"
          aria-label="답변 상태 필터"
          value={selectedAnswerStatus}
          onChange={(e) => setSelectedAnswerStatus(e.target.value)}
        >
          <option value="ALL">전체</option>
          <option value="OPEN">답변 대기</option>
          <option value="ANSWERED">답변 완료</option>
        </select>
        <button type="submit" aria-label="검색">
          검색
        </button>
      </form>
      {/* 질문 카드 목록 */}
      <ul className="qna-page__list">
        {visibleQuestions.map((item) => (
          <li
            key={item.id}
            className={`qna-page__item ${item.visibility === "PRIVATE" ? "qna-page__item--private" : ""}`}
          >
            <button
              type="button"
              className="qna-page__item-button"
              aria-label={`질문 상세: ${item.title}`}
              onClick={() => onSelect && onSelect({ view: "detail", question: item })}
            >

              <div className="qna-page__item-content">
                <h3>
                  <span className="qna-page__category-badge">[{item.category}]</span> {item.title}
                </h3>
                <p className="qna-page__item-meta">
                  {item.visibility === "PRIVATE" ? "비공개 · 작성자만 열람" : "공개"} · {item.status === "ANSWERED" ? "답변 완료" : "답변 대기"} · {item.createdAt}
                </p>
              </div>
              <div className="qna-page__item-status">
                {item.visibility === "PRIVATE" ? (
                  <span className="qna-page__badge qna-page__badge--private">비공개</span>
                ) : item.status === "ANSWERED" ? (
                  <span className="qna-page__badge qna-page__badge--answered">답변 완료</span>
                ) : (
                  <span className="qna-page__badge qna-page__badge--open">답변 대기</span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {/* 페이지네이션 조작 컨트롤러 */}
      <div className="qna-page__pagination">
        <button
          type="button"
          aria-label="이전 페이지"
          disabled={page === 1}
          onClick={() => {
            const nextP = Math.max(1, page - 1);
            setPage(nextP);
            if (onSearch) onSearch({ query: searchQuery.trim(), category: selectedCategory, answerStatus: selectedAnswerStatus, page: nextP });
          }}
        >
          이전
        </button>
        <span>페이지 {page}</span>
        <button
          type="button"
          aria-label="다음 페이지"
          onClick={() => {
            const nextP = page + 1;
            setPage(nextP);
            if (onSearch) onSearch({ query: searchQuery.trim(), category: selectedCategory, answerStatus: selectedAnswerStatus, page: nextP });
          }}
        >
          다음
        </button>
      </div>
    </main>
  );
}

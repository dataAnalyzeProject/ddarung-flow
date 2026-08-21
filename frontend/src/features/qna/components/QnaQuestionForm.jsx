import { useState } from "react";
import { categoryOptions } from "../data/qnaOptions";

export default function QnaQuestionForm({ onCancel, onCreate, onUpdate, initialQuestion = null }) {
  const isEditing = Boolean(initialQuestion);
  const [category, setCategory] = useState(initialQuestion?.category || "SERVICE");
  const [visibility, setVisibility] = useState(initialQuestion?.visibility || "PUBLIC");
  const [title, setTitle] = useState(initialQuestion?.title || "");
  const [body, setBody] = useState(initialQuestion?.body || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("제목과 내용을 모두 입력해 주세요.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const request = { category, visibility, title: title.trim(), body: body.trim() };
      if (isEditing) await onUpdate(request);
      else await onCreate(request);
    } catch (requestError) {
      if (requestError.status === 401) setError("로그인 후 질문을 작성할 수 있습니다");
      else if (requestError.status === 409) setError(requestError.message || "질문 내용이 현재 상태와 충돌합니다.");
      else setError(requestError.message || (isEditing ? "질문을 수정하지 못했습니다." : "질문을 등록하지 못했습니다."));
      setSubmitting(false);
    }
  };

  return (
    <section className="qna-compose" aria-labelledby="qna-compose-title">
      <div className="qna-compose-heading">
        <div><h1 id="qna-compose-title">{isEditing ? "질문 수정" : "질문 작성"}</h1><p>궁금한 내용을 남겨주시면 확인 후 답변해 드립니다.</p></div>
        <button type="button" onClick={onCancel}>목록으로</button>
      </div>
      <form className="qna-compose-card" onSubmit={submit}>
        {error && <p className="qna-form-error" role="alert">{error}</p>}
        <div className="qna-form-row">
          <label>분류<select aria-label="질문 분류" value={category} onChange={(event) => setCategory(event.target.value)}>{categoryOptions.slice(1).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>공개 여부<select aria-label="공개 여부" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PUBLIC">공개</option><option value="PRIVATE">비공개</option></select></label>
        </div>
        <label>제목<input aria-label="질문 제목" maxLength="120" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="제목을 입력하세요" /></label>
        <label>내용<textarea aria-label="질문 내용" maxLength="5000" value={body} onChange={(event) => setBody(event.target.value)} placeholder="내용을 입력하세요" /></label>
        <div className="qna-form-actions"><button type="button" onClick={onCancel} disabled={submitting}>취소</button><button type="submit" disabled={submitting}>{submitting ? "처리 중" : isEditing ? "수정 완료" : "질문 등록"}</button></div>
      </form>
    </section>
  );
}

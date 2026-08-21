import { useState } from "react";
import { categoryOptions } from "../data/qnaOptions";

export default function QnaQuestionForm({ onCancel, onCreate }) {
  const [category, setCategory] = useState("SERVICE");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
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
      await onCreate({ category, visibility, title: title.trim(), body: body.trim() });
    } catch (requestError) {
      setError(requestError.status === 401 ? "질문을 등록하려면 로그인이 필요합니다." : requestError.message || "질문을 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
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
          <label>분류<select aria-label="질문 분류" value={category} onChange={(event) => setCategory(event.target.value)}>{categoryOptions.slice(1).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>공개 여부<select aria-label="공개 여부" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PUBLIC">공개</option><option value="PRIVATE">비공개</option></select></label>
        </div>
        <label>제목<input aria-label="질문 제목" maxLength="120" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="제목을 입력하세요" /></label>
        <label>내용<textarea aria-label="질문 내용" maxLength="5000" value={body} onChange={(event) => setBody(event.target.value)} placeholder="내용을 입력하세요" /></label>
        <div className="qna-form-actions"><button type="button" onClick={onCancel} disabled={submitting}>취소</button><button type="submit" disabled={submitting}>{submitting ? "등록 중" : "질문 등록"}</button></div>
      </form>
    </section>
  );
}

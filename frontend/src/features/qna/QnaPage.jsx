import "./QnaPage.css";

export default function QnaPage({ status = "idle", questions = [], onSearch, onSubmit, onSelect }) {
  void questions;
  void onSearch;
  void onSubmit;
  void onSelect;
  return (
    <main className="qna-page" data-status={status}>
      <h1>질문과 답변</h1>
      <p>TODO(EXP-FE-3.5-QNA): 승인된 상태와 callback만 구현합니다.</p>
    </main>
  );
}

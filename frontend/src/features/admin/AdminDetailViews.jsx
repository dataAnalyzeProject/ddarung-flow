const label = (state) => state === "PENDING" ? "OPEN" : state;

const Back = ({ onBack }) => <button type="button" className="admin-table-link" onClick={onBack}>목록으로 돌아가기</button>;

export function ExportDetail({ item, onBack, onDownload }) {
  const isComplete = item.state === "완료";
  return <section className="admin-panel admin-tall-panel" data-testid="export-detail">
    <header className="admin-panel-head"><h2>관리자 / 데이터·Export / {item.id}</h2><Back onBack={onBack} /></header>
    <div className="admin-request-detail"><strong>{item.type}</strong><p>요청자: {item.requester}</p><p>상태: {item.state}</p><p>진행률: {item.progress}%</p>{item.reason && <p>안내: {item.reason}</p>}{item.state === "만료" && <p>안내: 새 Export 요청이 필요합니다.</p>}{isComplete && <button type="button" className="admin-button primary" onClick={() => onDownload(item)}>다운로드</button>}</div>
  </section>;
}

export function QnaAnswerDetail({ question, answer, onAnswerChange, onAnswer, onHide, onBack }) {
  const hasAnswer = Boolean(question.answers?.length);
  return <section className="admin-panel admin-tall-panel" data-testid="qna-detail">
    <header className="admin-panel-head"><h2>관리자 / Q&A 관리 / {question.id}</h2><Back onBack={onBack} /></header>
    <div className="admin-qna-detail"><span className="admin-chip">{question.visibility}</span><h3>{question.title}</h3><p>{question.body}</p><p>분류: {question.category} · 상태: {label(question.status)}</p>{hasAnswer && <p>답변: {question.answers[0].body || question.answers[0]}</p>}{!hasAnswer && <><textarea aria-label="답변 내용" value={answer} onChange={(event) => onAnswerChange(event.target.value)} /><div className="admin-action-row"><button type="button" className="admin-button primary" onClick={onAnswer} disabled={!answer.trim()}>답변 보내기</button></div></>}<div className="admin-action-row"><button type="button" className="admin-button" onClick={onHide}>숨김</button></div></div>
    {question.visibility === "PRIVATE" && <p className="admin-private-protection">PRIVATE 문의는 권한 있는 ADMIN만 처리합니다.</p>}
  </section>;
}

import "./ModelOpsPage.css";

export default function ModelOpsPage({ status = "idle", models = [], actor = null, onAction }) {
  void models;
  void actor;
  void onAction;
  return <main className="modelops-page" data-status={status}><h1>모델 운영</h1><p>TODO(EXP-FE-4): 비교·승인·활성화·롤백 상태를 구현합니다.</p></main>;
}

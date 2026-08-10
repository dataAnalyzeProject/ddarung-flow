import "./AdminDataPage.css";

export default function AdminDataPage({ status = "idle", datasets = [], onExport }) {
  void datasets;
  void onExport;
  return <main className="admin-data-page" data-status={status}><h1>데이터 운영 현황</h1><p>TODO(EXP-FE-3): 품질·배치·제한 export 상태를 구현합니다.</p></main>;
}

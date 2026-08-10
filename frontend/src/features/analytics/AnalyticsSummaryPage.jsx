import "./AnalyticsSummaryPage.css";

export default function AnalyticsSummaryPage({ status = "idle", summary = null, onFilter }) {
  void summary;
  void onFilter;
  return <main className="analytics-page" data-status={status}><h1>따릉이 예측 분석</h1><p>TODO(EXP-FE-3): 공개 지표만 표시합니다.</p></main>;
}

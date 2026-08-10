import "./MyPage.css";

export default function MyPage({ status = "idle", data = null, onAction }) {
  void data;
  void onAction;
  return <main className="my-page" data-status={status}><h1>내 보관함</h1><p>TODO(EXP-FE-2): 즐겨찾기·경로·이력·인앱 알림을 구현합니다.</p></main>;
}

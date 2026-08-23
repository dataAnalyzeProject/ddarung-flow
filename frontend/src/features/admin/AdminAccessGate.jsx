import { useEffect, useState } from "react";
import { getCurrentUser, logout } from "../login/authApi";
import AdminApp from "./AdminApp";
import { ADMIN_ROLES } from "./adminFixture";
import "./AdminAccessGate.css";

const ADMIN_ROLE_VALUES = new Set([ADMIN_ROLES.ADMIN]);

function AccessState({ title, children, testId }) {
  return <main className="admin-access-gate" data-testid={testId} aria-live="polite">
    <section className="admin-access-card">
      <p>따라가요 관리자 콘솔</p>
      <h1>{title}</h1>
      {children && <div className="admin-access-actions">{children}</div>}
    </section>
  </main>;
}

export default function AdminAccessGate() {
  const [state, setState] = useState({ status: "loading", role: null });

  const checkAccess = () => {
    setState({ status: "loading", role: null });
    getCurrentUser()
      .then((auth) => {
        if (!auth.authenticated) {
          setState({ status: "anonymous", role: null });
          return;
        }
        setState({ status: ADMIN_ROLE_VALUES.has(auth.user?.role) ? "allowed" : "forbidden", role: auth.user?.role || null });
      })
      .catch(() => setState({ status: "error", role: null }));
  };

  useEffect(() => {
    checkAccess();
  }, []);

  const handleAction = async (action) => {
    if (action.type === "return_service") {
      window.location.assign("/");
      return;
    }
    if (action.type === "logout") {
      await logout();
      window.location.assign("/");
    }
  };

  if (state.status === "loading") {
    return <AccessState testId="admin-access-loading" title="관리자 권한을 확인하고 있습니다." />;
  }
  if (state.status === "anonymous") {
    return <AccessState testId="admin-access-anonymous" title="관리자 로그인 필요"><a href="/login">로그인으로 이동</a></AccessState>;
  }
  if (state.status === "forbidden") {
    return <AccessState testId="admin-access-forbidden" title="관리자 권한이 없습니다."><a href="/">일반 서비스로 돌아가기</a></AccessState>;
  }
  if (state.status === "error") {
    return <AccessState testId="admin-access-error" title="관리자 권한 확인에 실패했습니다."><button type="button" onClick={checkAccess}>다시 시도</button></AccessState>;
  }
  return <AdminApp actorRole={state.role} onAction={handleAction} />;
}

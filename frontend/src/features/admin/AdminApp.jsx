import { useState } from "react";
import AdminShell from "./AdminShell";
import { ADMIN_ROLES, canAccess, fixture } from "./adminFixture";
import { AdminPage, AdminStatePanel } from "./AdminPages";

export default function AdminApp({ actorRole = ADMIN_ROLES.ADMIN, viewState = "success", activeMenuId = "dashboard", data = fixture, onAction = () => {} }) {
  const [menuId, setMenuId] = useState(activeMenuId);
  const onMenu = (nextId) => {
    onAction({ type: "menu", menuId: nextId });
    setMenuId(nextId);
  };
  const forbidden = actorRole === ADMIN_ROLES.USER || actorRole === ADMIN_ROLES.ANONYMOUS || !canAccess(actorRole, menuId);
  return <AdminShell activeMenuId={menuId} actorRole={actorRole} onMenu={onMenu} onAction={onAction}>
    {forbidden ? <AdminStatePanel state="forbidden" /> : viewState !== "success" ? <AdminStatePanel state={viewState} /> : <AdminPage menuId={menuId} actorRole={actorRole} fixtureData={data} onAction={onAction} />}
  </AdminShell>;
}

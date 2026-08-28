import { STATE_COPY } from '../states/adminStates';

export default function AsyncStatePanel({ state, code, requiredPermission }) {
  const label = STATE_COPY[state] || STATE_COPY.ERROR;
  return <section className="admin-v2-state-panel" aria-live="polite" aria-label={`${label} 상태`}>
    <strong>{label}</strong>
    {code ? <p>{code}</p> : null}
    {requiredPermission ? <p>필요 권한: {requiredPermission}</p> : null}
  </section>;
}

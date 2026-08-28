import { STATE_COPY } from '../states/adminStates';

export default function AsyncStatePanel({ state, code, requiredPermission, onRetry }) {
  const accessCopy = {
    AUTH_REQUIRED: { title: '관리자 로그인이 필요합니다.', description: '로그인 후 관리자 콘솔을 이용할 수 있습니다.' },
    ADMIN_ACCESS_DENIED: { title: '관리자 콘솔 접근 권한이 없습니다.', description: '일반 서비스로 돌아가 주세요.' },
    ADMIN_ACCESS_UNAVAILABLE: { title: '관리자 권한 정보를 불러오지 못했습니다.', description: '잠시 후 다시 시도해 주세요.' },
  };
  const copy = accessCopy[code];
  const label = copy?.title || STATE_COPY[state] || STATE_COPY.ERROR;
  const live = ['LOADING', 'DELAYED', 'UNAVAILABLE', 'ERROR'].includes(state) ? 'polite' : undefined;
  return <section className="admin-v2-state-panel" aria-live={live} aria-label={`${label} 상태`}>
    <strong>{label}</strong>
    {copy?.description ? <p>{copy.description}</p> : null}
    {code ? <p>{code}</p> : null}
    {requiredPermission ? <p>필요 권한: {requiredPermission}</p> : null}
    {code === 'ADMIN_ACCESS_UNAVAILABLE' && typeof onRetry === 'function' ? <button type="button" onClick={onRetry}>다시 시도</button> : null}
  </section>;
}

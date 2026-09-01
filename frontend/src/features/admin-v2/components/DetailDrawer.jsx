import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useOverlayFocus from '../hooks/useOverlayFocus';

const contextualQuery = '(max-width: 960px)';
const triggerSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useContextualModal(contextual) {
  const [narrowViewport, setNarrowViewport] = useState(() => contextual && typeof window.matchMedia === 'function' ? window.matchMedia(contextualQuery).matches : false);

  useEffect(() => {
    if (!contextual || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(contextualQuery);
    const update = () => setNarrowViewport(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, [contextual]);

  return narrowViewport;
}

export default function DetailDrawer({ open, title, children, onClose, variant = 'modal' }) {
  const titleId = useId();
  const triggerRef = useRef(null);
  const { dialogRef, closeButtonRef, onKeyDown } = useOverlayFocus({ open, onClose });
  const contextual = variant === 'contextual';
  const narrowViewport = useContextualModal(contextual);
  const modal = !contextual || narrowViewport;

  useLayoutEffect(() => {
    if (!open || triggerRef.current) return;
    const activeTarget = document.activeElement instanceof Element ? document.activeElement.closest(triggerSelector) : null;
    if (activeTarget?.isConnected) triggerRef.current = activeTarget;
  }, [open]);

  useEffect(() => {
    if (open) return undefined;
    const rememberTrigger = (event) => {
      const target = event.target instanceof Element ? event.target.closest(triggerSelector) : null;
      if (target?.isConnected) triggerRef.current = target;
    };
    document.addEventListener('pointerdown', rememberTrigger, true);
    return () => document.removeEventListener('pointerdown', rememberTrigger, true);
  }, [open]);

  useEffect(() => {
    if (!open || !modal) return undefined;
    const appShell = document.querySelector('.admin-v2-shell');
    const wasInert = appShell?.hasAttribute('inert');
    appShell?.setAttribute('inert', '');
    return () => {
      if (!wasInert) appShell?.removeAttribute('inert');
    };
  }, [modal, open]);

  useEffect(() => {
    if (!open) return undefined;
    return () => {
      const restoreTarget = triggerRef.current;
      restoreTarget?.isConnected && restoreTarget.focus();
    };
  }, [open]);

  function onContextualKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  if (!open) return null;
  return createPortal(<>{modal ? <div className="admin-v2-drawer-backdrop" aria-hidden="true" onMouseDown={onClose} /> : null}<aside ref={dialogRef} tabIndex={-1} className={`admin-v2-drawer admin-v2-drawer--${modal ? 'modal' : 'contextual'}`} role="dialog" aria-modal={modal ? 'true' : undefined} aria-labelledby={titleId} onKeyDown={modal ? onKeyDown : onContextualKeyDown}><h2 id={titleId}>{title}</h2>{children}<button ref={closeButtonRef} type="button" onClick={onClose} aria-label={`${title} 닫기`}>닫기</button></aside></>, document.body);
}

import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import useOverlayFocus from '../hooks/useOverlayFocus';

export default function DetailDrawer({ open, title, children, onClose }) {
  const titleId = useId();
  const { dialogRef, closeButtonRef, onKeyDown } = useOverlayFocus({ open, onClose });

  useEffect(() => {
    if (!open) return undefined;
    const appShell = document.querySelector('.admin-v2-shell');
    const wasInert = appShell?.hasAttribute('inert');
    appShell?.setAttribute('inert', '');
    return () => {
      if (!wasInert) appShell?.removeAttribute('inert');
    };
  }, [open]);

  if (!open) return null;
  return createPortal(<><div className="admin-v2-drawer-backdrop" aria-hidden="true" onMouseDown={onClose} /><aside ref={dialogRef} tabIndex={-1} className="admin-v2-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}><h2 id={titleId}>{title}</h2>{children}<button ref={closeButtonRef} type="button" onClick={onClose} aria-label={`${title} 닫기`}>닫기</button></aside></>, document.body);
}

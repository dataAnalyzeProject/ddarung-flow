import { useId } from 'react';
import useOverlayFocus from '../hooks/useOverlayFocus';

export default function DetailDrawer({ open, title, children, onClose }) {
  const titleId = useId();
  const { dialogRef, closeButtonRef, onKeyDown } = useOverlayFocus({ open, onClose });
  if (!open) return null;
  return <aside ref={dialogRef} className="admin-v2-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}><h2 id={titleId}>{title}</h2>{children}<button ref={closeButtonRef} type="button" onClick={onClose} aria-label={`${title} 닫기`}>닫기</button></aside>;
}

import { useId } from 'react';
import useOverlayFocus from '../hooks/useOverlayFocus';

export default function ReasonDialog({ open, title = '사유 확인', children, onClose }) {
  const titleId = useId();
  const { dialogRef, closeButtonRef, onKeyDown } = useOverlayFocus({ open, onClose, initialFocus: 'close' });
  if (!open) return null;
  return <div className="admin-v2-dialog-backdrop" role="presentation"><section ref={dialogRef} className="admin-v2-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}><h2 id={titleId}>{title}</h2>{children}<button ref={closeButtonRef} type="button" onClick={onClose}>닫기</button></section></div>;
}

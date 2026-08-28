import { useEffect, useRef } from 'react';

export default function ReasonDialog({ open, title = '사유 확인', children, onClose }) {
  const closeButton = useRef(null);
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);
  if (!open) return null;
  return <div className="admin-v2-dialog-backdrop" role="presentation"><section className="admin-v2-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-v2-dialog-title"><h2 id="admin-v2-dialog-title">{title}</h2>{children}<button ref={closeButton} type="button" onClick={onClose}>닫기</button></section></div>;
}

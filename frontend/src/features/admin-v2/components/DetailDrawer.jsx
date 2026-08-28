import { useEffect, useRef } from 'react';

export default function DetailDrawer({ open, title, children, onClose }) {
  const closeButton = useRef(null);
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);
  if (!open) return null;
  return <aside className="admin-v2-drawer" aria-label={title} role="complementary"><button ref={closeButton} type="button" onClick={onClose} aria-label={`${title} 닫기`}>닫기</button><h2>{title}</h2>{children}</aside>;
}

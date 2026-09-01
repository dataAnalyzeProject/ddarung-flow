import { useEffect, useRef } from 'react';

const focusable = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function useOverlayFocus({ open, onClose, initialFocus = 'dialog' }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousActiveElement = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousActiveElement.current = document.activeElement;
    if (initialFocus === 'close') closeButtonRef.current?.focus();
    else dialogRef.current?.focus();
    return () => previousActiveElement.current?.focus?.();
  }, [initialFocus, open]);

  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const items = [...(dialogRef.current?.querySelectorAll(focusable) || [])].filter((item) => !item.hidden);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (document.activeElement === dialogRef.current) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return { dialogRef, closeButtonRef, onKeyDown };
}

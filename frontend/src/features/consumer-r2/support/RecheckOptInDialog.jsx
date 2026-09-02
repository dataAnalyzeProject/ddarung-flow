import { useEffect, useRef, useState } from "react";
import { ConsumerButton } from "../shared";

export const SEARCH_RECHECK_LEAD_MINUTES = 15;
const systemNow = () => new Date();

function localInputValue(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function earliestDeparture(now) {
  const minimum = now.getTime() + SEARCH_RECHECK_LEAD_MINUTES * 60_000;
  return new Date(Math.ceil(minimum / 60_000) * 60_000);
}

function defaultDeparture(now) {
  const date = new Date(now.getTime() + 60 * 60_000);
  date.setSeconds(0, 0);
  return localInputValue(date);
}

export function validateDepartureAt(value, now) {
  const departure = new Date(value);
  if (!value || Number.isNaN(departure.getTime())) return "출발 시각을 입력해 주세요.";
  if (departure.getTime() < now.getTime() + SEARCH_RECHECK_LEAD_MINUTES * 60_000) {
    return "출발 시각은 지금부터 15분 이후로 선택해 주세요.";
  }
  return "";
}

export default function RecheckOptInDialog({ busy = false, kind = "SEARCH_RECHECK", now = systemNow, onClose, onConfirm, open }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [departureAt, setDepartureAt] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const openedAt = now();
    restoreFocusRef.current = document.activeElement;
    setDepartureAt(defaultDeparture(openedAt));
    setError("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => restoreFocusRef.current?.focus?.();
  }, [open, now]);

  if (!open) return null;

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busy) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled]), input:not([disabled])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event) {
    event.preventDefault();
    const currentNow = now();
    const validationError = validateDepartureAt(departureAt, currentNow);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    onConfirm(new Date(departureAt).toISOString());
  }

  const isSearch = kind === "SEARCH_RECHECK";
  return (
    <div className="cr22-support__dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section
        aria-describedby="recheck-dialog-description"
        aria-labelledby="recheck-dialog-title"
        aria-modal="true"
        className="cr22-support__dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="cr22-support__eyebrow">{isSearch ? "검색 재확인" : "계획 재확인"}</p>
            <h2 id="recheck-dialog-title">출발 전에 다시 확인할까요?</h2>
          </div>
          <button aria-label="재확인 신청 닫기" className="cr22-support__dialog-close" disabled={busy} onClick={onClose} type="button">×</button>
        </header>
        <p id="recheck-dialog-description">출발 15분 전에 알림을 보내 드려요. 알림을 열면 저장된 조건으로 현재 데이터를 새로 확인합니다.</p>
        <form noValidate onSubmit={submit}>
          <div className="cr22-field">
            <label className="cr22-field__label" htmlFor="recheck-departure-at">출발 시각 <span aria-hidden="true" className="cr22-field__required">*</span></label>
            <input
              aria-describedby={`recheck-departure-at-hint${error ? " recheck-departure-at-error" : ""}`}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
              id="recheck-departure-at"
              min={localInputValue(earliestDeparture(now()))}
              name="departureAt"
              onChange={(event) => { setDepartureAt(event.target.value); setError(""); }}
              ref={inputRef}
              required
              type="datetime-local"
              value={departureAt}
            />
            <p className="cr22-field__hint" id="recheck-departure-at-hint">신청 가능한 가장 이른 시각은 지금부터 15분 뒤입니다.</p>
            {error ? <p className="cr22-field__error" id="recheck-departure-at-error" role="alert">{error}</p> : null}
          </div>
          <div className="cr22-support__dialog-actions">
            <ConsumerButton disabled={busy} onClick={onClose} variant="secondary">취소</ConsumerButton>
            <ConsumerButton loading={busy} loadingLabel="신청 중…" type="submit">15분 전 알림 받기</ConsumerButton>
          </div>
        </form>
      </section>
    </div>
  );
}

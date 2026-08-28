const LABELS = { OPS: '운영', MODEL: '모델', SYSTEM: '시스템' };

export default function AdminConsoleSwitcher({ consoles, activeConsole, onSelect }) {
  return <nav aria-label="관리자 콘솔 전환"><div className="admin-v2-console-switcher" role="tablist">
    {consoles.map((consoleId) => <button key={consoleId} type="button" role="tab" aria-selected={consoleId === activeConsole} onClick={() => onSelect(consoleId)}>{LABELS[consoleId]}</button>)}
  </div></nav>;
}

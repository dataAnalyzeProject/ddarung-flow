export function QnaIcon({ color = "#0877f4" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="3" aria-hidden="true">
      <path d="M24 42c10 0 18-8 18-18S34 6 24 6 6 14 6 24c0 4 1 7 3 10l-2 8 8-3c3 2 6 3 9 3Z" />
      <path d="M18 19c1-5 10-6 12-1 2 4-4 6-5 9v2" />
      <circle cx="24" cy="34" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}

export function FolderIcon({ color = "#0877f4" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="3" aria-hidden="true">
      <path d="M5 14h14l4 5h20v22H5z" strokeLinejoin="round" />
    </svg>
  );
}

export function BellIcon({ color = "#0877f4" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="3" aria-hidden="true">
      <path d="M11 34h26l-3-5V20c0-7-4-12-10-12s-10 5-10 12v9l-3 5Z" />
      <path d="M19 36c1 4 3 5 5 5s4-1 5-5" />
    </svg>
  );
}

const PATHS = {
  arrowRight: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  bike: <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="m6 17 4-7h3l3 7M9 12h7l2-3h2M10 10 8 7h3" /></>,
  check: <path d="m6 12 4 4 8-9" />,
  chevronDown: <path d="m7 10 5 5 5-5" />,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  mapPin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  plan: <><path d="M4 5h16v15H4zM8 3v4M16 3v4M4 10h16" /><path d="m8 15 2 2 5-5" /></>,
  qna: <><path d="M21 14a4 4 0 0 1-4 4H9l-5 3v-7a7 7 0 1 1 17 0Z" /><path d="M9.5 10a2.5 2.5 0 1 1 4.1 1.9c-1 .7-1.6 1-1.6 2.1M12 16h.01" /></>,
  retry: <><path d="M20 6v5h-5" /><path d="M18.5 16a8 8 0 1 1-.5-9.5L20 9" /></>,
  ride: <><path d="M5 18c3-5 5-7 9-9" /><path d="m12 5 4 4-4 4" /><circle cx="7" cy="6" r="2" /><path d="M7 8v5l-3 4M8 11l4 2" /></>,
  transit: <><rect x="5" y="3" width="14" height="16" rx="3" /><path d="M8 7h8M8 12h8M8 19l-2 2M16 19l2 2" /><circle cx="9" cy="16" r="1" /><circle cx="15" cy="16" r="1" /></>,
  walk: <><circle cx="13" cy="4.5" r="2" /><path d="M12.5 6.5 9 8.5l1 4" /><path d="M9 8.5l4 1.5 2.5-2" /><path d="M10 12.5 7 19" /><path d="M13 10l3 3-1 6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" /></>,
};

export default function ConsumerIcon({ name, label, size = 24 }) {
  const icon = PATHS[name];
  if (!icon) return null;

  return (
    <svg
      className="cr22-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {icon}
    </svg>
  );
}

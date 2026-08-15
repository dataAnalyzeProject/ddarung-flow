export function BellIcon({ color = "#0877f4" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="3" aria-hidden="true">
      <path d="M11 34h26l-3-5V20c0-7-4-12-10-12s-10 5-10 12v9l-3 5Z" />
      <path d="M19 36c1 4 3 5 5 5s4-1 5-5" />
    </svg>
  );
}

export function TrendIcon({ color = "#08a36f" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="4" aria-hidden="true">
      <path d="M8 32l10-10 8 7 14-15" />
      <path d="M31 14h9v9" />
    </svg>
  );
}

export function RouteIcon({ color = "#0877f4" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="3" aria-hidden="true">
      <path d="M12 36c-6-7 2-10 6-5 4 5 8 1 9-4 1-5 5-6 10-4" strokeDasharray="3 4" />
      <path d="M13 23c4-5 5-7 5-10a5 5 0 1 0-10 0c0 3 1 5 5 10Z" />
      <path d="M37 18c4-5 5-7 5-10a5 5 0 1 0-10 0c0 3 1 5 5 10Z" />
    </svg>
  );
}

export function BikeIcon({ color = "#08a36f" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="3" aria-hidden="true">
      <circle cx="13" cy="33" r="8" />
      <circle cx="36" cy="33" r="8" />
      <path d="M13 33l8-14h8l7 14M21 19l9 14H13M18 15h7M28 13h6" />
    </svg>
  );
}

export function alertKindIcon(kind) {
  if (kind === "trend") return <TrendIcon color="#08a36f" />;
  if (kind === "route") return <RouteIcon />;
  return <BellIcon />;
}

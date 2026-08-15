export function BikePinIcon({ color = "#08a36f" }) {
  return (
    <svg viewBox="0 0 64 80" aria-hidden="true">
      <path d="M32 76C27 68 5 43 5 28a27 27 0 1 1 54 0c0 15-22 40-27 48Z" fill={color} />
      <g transform="translate(15 27)" fill="none" stroke="#fff" strokeWidth="3">
        <circle cx="8" cy="16" r="7" />
        <circle cx="26" cy="16" r="7" />
        <path d="M8 16l6-11h6l5 11M14 5h7M20 3h5" />
      </g>
    </svg>
  );
}

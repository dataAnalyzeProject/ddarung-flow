export const iconPaths = {
  arrow: "M15 4l-8 8 8 8M7 12h14",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.7-3.4 3.1-5 7-5s6.3 1.6 7 5",
  bike: "M7 17a4 4 0 1 1-4-4 4 4 0 0 1 4 4Zm14 0a4 4 0 1 1-4-4 4 4 0 0 1 4 4ZM7 17l4-8 4 8M9 11h7l-2-4h-3M15 17h2l-3-8",
  rain: "M7 16h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.2 1.5A3.4 3.4 0 0 0 7 16Zm2 3-1 2m5-2-1 2m5-2-1 2",
  wind: "M3 8h11c2.5 0 2.5-4 0-4m-11 8h16c2.8 0 2.8-4 0-4m-16 8h10c2.8 0 2.8 4 0 4",
  air: "M12 4v.01M6.3 6.3v.01m11.4 0v.01M4 12v.01m16 0v.01M6.3 17.7v.01m11.4 0v.01M12 20v.01",
  leaf: "M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-8 10-16ZM5 21c2-5 6-8 11-10",
  route: "M6 9c2-2.4 3-4.1 3-5.2a3 3 0 1 0-6 0C3 4.9 4 6.6 6 9Zm12 12c2-2.4 3-4.1 3-5.2a3 3 0 1 0-6 0c0 1.1 1 2.8 3 5.2ZM6 9c0 5 12 2 12 7",
  thermometer: "M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0ZM12 8v9",
  umbrella: "M4 11a8 8 0 0 1 16 0H4Zm8 0v7c0 3 4 3 4 0",
  info: "M12 11v6m0-10h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
  warning: "M12 4 3 20h18L12 4Zm0 5v5m0 3h.01",
  transit: "M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2Zm-2 8h16M7 20l2-4m8 4-2-4M8 8h3m2 0h3",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v5l3 2",
  status: "M5 5h14v14H5V5Zm3 7 2.5 2.5L16 9",
};

export default function GuideIcon({ name, className = "", title }) {
  return (
    <svg
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      className={`guide-icon ${className}`}
      fill="none"
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={iconPaths[name] || iconPaths.info} />
    </svg>
  );
}

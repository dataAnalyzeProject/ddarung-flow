export function formatProbability(value) {
  const numeric = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(numeric)) return null;
  const percent = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
  return `${Number(percent.toFixed(1))}%`;
}

export function formatWalkDuration(seconds) {
  const numeric = Number(seconds);
  if (seconds === null || seconds === undefined || seconds === '' || !Number.isFinite(numeric)) return null;
  return `약 ${Math.ceil(numeric / 60)}분`;
}

export function formatDistance(meters) {
  const numeric = Number(meters);
  if (meters === null || meters === undefined || meters === '' || !Number.isFinite(numeric)) return null;
  return `${Math.round(numeric)}m`;
}

export function formatTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function formatAvailabilityLevel(value) {
  return ({ HIGH: '높음', MEDIUM: '중간', LOW: '낮음' })[value] || value || null;
}

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
export default function RhythmHeatmap({ cells = [] }) {
  if (cells.length < 20) return null;
  const byCell = new Map(cells.map((cell) => [`${cell.dayOfWeek}-${cell.hourOfDay}`, cell]));
  const hours = [6, 8, 10, 12, 14, 16, 18, 20, 22];
  return <section aria-label="요일 시간대별 재고 패턴" className="rhythm-heatmap"><div className="rhythm-hours">{hours.map((hour) => <span key={hour}>{hour}</span>)}</div>{DAYS.map((day, index) => <div className="rhythm-row" key={day}><b>{day}</b>{hours.map((hour) => { const cell = byCell.get(`${index + 1}-${hour}`); return <i aria-label={cell ? `${day} ${hour}시 품절률 ${Math.round(cell.stockoutRate * 100)}%` : `${day} ${hour}시 표본 부족`} className={cell ? `rhythm-cell rate-${Math.min(4, Math.floor(cell.stockoutRate * 5))}` : "rhythm-cell empty"} key={hour} />; })}</div>)}</section>;
}

export const SORT_OPTIONS = [
  { value: "probability", label: "대여 가능성 높은 순" },
  { value: "arrival", label: "도착 시간 빠른 순" },
];

export default function PredictionSortControls({ value, onChange }) {
  return (
    <label className="prediction-sort-controls">
      정렬 기준
      <select
        aria-label="정렬 기준"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AccessibleTable({ caption, columns = [], rows = [], rowKey, selectedKey, onSelect, getRowProps }) {
  if (!caption) throw new Error('AccessibleTable requires a caption');
  if (rows.length && typeof rowKey !== 'function') throw new Error('AccessibleTable requires a stable rowKey');
  const selectable = typeof onSelect === 'function' && typeof rowKey === 'function';
  return <table className="admin-v2-table"><caption>{caption}</caption><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{rows.map((row) => {
    const key = rowKey(row);
    const props = getRowProps?.(row) || {};
    return <tr key={key} {...props}>{row.map((cell, cellIndex) => <td key={columns[cellIndex] || cellIndex}>{selectable && cellIndex === 0 ? <button type="button" aria-pressed={key === selectedKey} onClick={() => onSelect(key)}>{cell}</button> : cell}</td>)}</tr>;
  })}</tbody></table>;
}

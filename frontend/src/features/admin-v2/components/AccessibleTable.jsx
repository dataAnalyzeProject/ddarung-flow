export default function AccessibleTable({ caption, columns = [], rows = [] }) {
  return <table className="admin-v2-table"><caption>{caption}</caption><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} tabIndex="0">{cell}</td>)}</tr>)}</tbody></table>;
}

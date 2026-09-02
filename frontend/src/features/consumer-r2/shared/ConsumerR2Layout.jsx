import "../styles/index.css";

export function ConsumerR2Theme({ as: Element = "div", className = "", children, ...props }) {
  return <Element className={`cr22-scope ${className}`.trim()} {...props}>{children}</Element>;
}

export function ConsumerContainer({ as: Element = "div", className = "", children, ...props }) {
  return <Element className={`cr22-container ${className}`.trim()} {...props}>{children}</Element>;
}

export function ConsumerGrid({ primary, secondary, ariaLabel }) {
  return (
    <section className="cr22-grid" aria-label={ariaLabel}>
      <div className="cr22-grid__primary">{primary}</div>
      <aside className="cr22-grid__secondary">{secondary}</aside>
    </section>
  );
}

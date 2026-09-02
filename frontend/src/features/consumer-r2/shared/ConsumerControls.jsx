import { cloneElement, isValidElement, useId } from "react";
import ConsumerIcon from "./ConsumerIcon.jsx";
import "../styles/index.css";

export function ConsumerButton({
  block = false,
  children,
  className = "",
  disabled = false,
  icon,
  iconPosition = "start",
  loading = false,
  loadingLabel = "처리 중…",
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}) {
  const classes = [
    "cr22-button",
    variant !== "primary" ? `cr22-button--${variant}` : "",
    size !== "md" ? `cr22-button--${size}` : "",
    block ? "cr22-button--block" : "",
    className,
  ].filter(Boolean).join(" ");
  const content = loading ? loadingLabel : children;

  return (
    <button {...props} className={classes} type={type} aria-busy={loading || undefined} disabled={loading || disabled}>
      {!loading && icon && iconPosition === "start" ? icon : null}
      <span>{content}</span>
      {!loading && icon && iconPosition === "end" ? icon : null}
    </button>
  );
}

export function StatusBadge({ children, tone = "neutral" }) {
  const toneClass = tone === "neutral" ? "" : ` cr22-badge--${tone}`;
  return <span className={`cr22-badge${toneClass}`}>{children}</span>;
}

export function OptionCard({ description, disabled = false, icon, onSelect, selected = false, title }) {
  return (
    <button className="cr22-option-card" type="button" aria-pressed={selected} disabled={disabled} onClick={onSelect}>
      {selected ? <span className="cr22-option-card__check" aria-hidden="true"><ConsumerIcon name="check" size={16} /></span> : null}
      {icon ? <span className="cr22-option-card__icon" aria-hidden="true">{icon}</span> : null}
      <span className="cr22-option-card__title">{title}</span>
      {description ? <span className="cr22-option-card__description">{description}</span> : null}
    </button>
  );
}

export function SelectedPlaceCard({ kind = "origin", meta, onReselect, title }) {
  return (
    <article className={`cr22-place-card cr22-place-card--${kind}`} aria-label={`${kind === "destination" ? "대여 희망 지역" : "출발 위치"}: ${title}`}>
      <div className="cr22-place-card__content">
        <span className="cr22-place-card__marker" aria-hidden="true"><ConsumerIcon name="mapPin" /></span>
        <div>
          <h3 className="cr22-place-card__title">{title}</h3>
          {meta ? <p className="cr22-place-card__meta">{meta}</p> : null}
        </div>
      </div>
      {onReselect ? <button className="cr22-place-card__action" type="button" onClick={onReselect}>다시 선택</button> : null}
    </article>
  );
}

export function FormField({ children, error, hint, id, label, required = false }) {
  const generatedId = useId();
  const fieldId = id || `cr22-field-${generatedId.replace(/:/g, "")}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  if (!isValidElement(children)) return null;
  const describedBy = [children.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="cr22-field">
      <label className="cr22-field__label" htmlFor={fieldId}>
        {label}{required ? <span className="cr22-field__required" aria-hidden="true"> *</span> : null}
      </label>
      {cloneElement(children, {
        id: fieldId,
        required,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {hint ? <p className="cr22-field__hint" id={hintId}>{hint}</p> : null}
      {error ? <p className="cr22-field__error" id={errorId}>{error}</p> : null}
    </div>
  );
}

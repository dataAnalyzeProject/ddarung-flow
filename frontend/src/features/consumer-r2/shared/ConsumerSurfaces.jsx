import ConsumerIcon from "./ConsumerIcon.jsx";
import { ConsumerButton } from "./ConsumerControls.jsx";
import "../styles/index.css";

export function SurfaceCard({ actions, children, quiet = false, title }) {
  return (
    <section className={`cr22-card${quiet ? " cr22-card--quiet" : ""}`}>
      {title || actions ? <header className="cr22-card__header">{title ? <h2>{title}</h2> : <span />}{actions}</header> : null}
      <div className="cr22-card__body">{children}</div>
    </section>
  );
}

export function Skeleton({ lines = 3 }) {
  return (
    <div className="cr22-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span className="cr22-skeleton__line" key={index} />)}
    </div>
  );
}

const STATE_COPY = {
  empty: { title: "표시할 내용이 없습니다", description: "조건을 바꾸거나 잠시 후 다시 확인해 주세요.", icon: "info" },
  error: { title: "내용을 불러오지 못했습니다", description: "연결 상태를 확인한 뒤 다시 시도해 주세요.", icon: "retry" },
  loading: { title: "불러오는 중…", description: "최신 정보를 확인하고 있습니다." },
  partial: { title: "일부 정보만 확인되었습니다", description: "확인된 정보와 확인하지 못한 정보를 구분해 보여 드립니다.", icon: "info" },
};

export function AsyncState({ actionLabel = "다시 시도", children, description, onAction, state, title }) {
  if (state === "success") return children;
  const copy = STATE_COPY[state] || STATE_COPY.empty;
  const isError = state === "error";
  const role = isError ? "alert" : "status";

  return (
    <section className={`cr22-state cr22-state--${state}`} role={role} aria-live={isError ? "assertive" : "polite"} aria-busy={state === "loading" || undefined}>
      {state === "loading" ? <Skeleton /> : <span className="cr22-state__icon" aria-hidden="true"><ConsumerIcon name={copy.icon} /></span>}
      <h2 className="cr22-state__title">{title || copy.title}</h2>
      <p className="cr22-state__description">{description || copy.description}</p>
      {children}
      {onAction ? <ConsumerButton size="sm" variant={isError ? "primary" : "secondary"} onClick={onAction}>{actionLabel}</ConsumerButton> : null}
    </section>
  );
}

export function MapShell({ ariaLabel = "지도", children, controls, footer, legend, panel }) {
  return (
    <section className="cr22-map-shell" aria-label={ariaLabel}>
      <div className="cr22-map-shell__canvas">
        {children}
        {panel ? <div className="cr22-map-shell__panel cr22-map-shell__overlay-card">{panel}</div> : null}
        {controls ? <div className="cr22-map-shell__controls">{controls}</div> : null}
        {legend ? <div className="cr22-map-shell__legend cr22-map-shell__overlay-card">{legend}</div> : null}
      </div>
      {footer ? <footer className="cr22-map-shell__footer">{footer}</footer> : null}
    </section>
  );
}

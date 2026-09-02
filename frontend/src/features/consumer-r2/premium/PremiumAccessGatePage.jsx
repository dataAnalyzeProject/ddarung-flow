import bikeCutout from "../../../assets/consumer-r2/premium/cr22-premium-bike-cutout-v1.webp";
import {
  ConsumerAppHeader,
  ConsumerButton,
  ConsumerContainer,
  ConsumerIcon,
  ConsumerR2Theme,
} from "../shared";
import { normalizePremiumAccessState } from "../adapters/premium";
import "./premium.css";

const FREE_FEATURES = [
  ["chart", "대여 가능성 비교", "도착시점 대여 가능성을 비교하고 실제 이동 경로를 확인할 수 있어요."],
  ["mapPin", "실제 주변 장소", "실제 데이터 기반의 주변 장소를 탐색하고 비교할 수 있어요."],
  ["bike", "자전거 경로", "실제 자전거 경로를 확인하고 라이딩 계획을 세울 수 있어요."],
];

const PREMIUM_FEATURES = [
  ["summary", "AI 라이딩 환경 요약", "날씨, 혼잡도, 안전도 등 라이딩 환경을 한눈에 요약"],
  ["recommend", "실제 장소에 대한 AI 추천 이유", "실제 장소의 매력과 선택 이유를 AI가 설명"],
  ["route", "AI Planner", "원하는 조건에 맞춰 최적의 코스를 제안"],
  ["calendar", "전체 AI 일정 생성", "이동, 장소, 휴식까지 포함한 나만의 하루 일정을 자동 생성"],
];

const STATE_NOTICE = {
  PROCESSING: ["처리 중", "Sandbox 결제 결과와 Premium 접근 상태를 확인하고 있습니다."],
  ACTIVE: ["Premium 활성", "AI 기능을 사용할 수 있습니다."],
  EXPIRED: ["Premium 만료", "Sandbox 접근 기간이 끝났습니다. 새 테스트 플랜을 선택해 주세요."],
  ERROR: ["상태 확인 실패", "Premium 접근 상태를 불러오지 못했습니다. 다시 확인해 주세요."],
};

function FeatureIcon({ name }) {
  const iconName = name === "calendar" ? "plan" : name === "route" ? "ride" : name === "chart" ? "transit" : "mapPin";
  return <span className="cr22-premium__feature-icon" aria-hidden="true"><ConsumerIcon name={iconName} /></span>;
}

export default function PremiumAccessGatePage({
  accessState = "FREE",
  authState = "authenticated",
  onContinueFree,
  onLogin,
  onNavigate,
  onOpenCheckout,
  onOpenPremium,
  onRetry,
  user,
}) {
  const state = normalizePremiumAccessState(accessState, authState);
  const primaryAction = state === "ANONYMOUS" ? onLogin : state === "ACTIVE" ? onOpenPremium : state === "ERROR" ? onRetry : onOpenCheckout;
  const primaryLabel = state === "ANONYMOUS" ? "로그인하고 Premium 보기" : state === "ACTIVE" ? "Premium AI 기능 열기" : state === "ERROR" ? "상태 다시 확인" : state === "PROCESSING" ? "상태 확인 중…" : "Premium 테스트 플랜 보기";

  return (
    <ConsumerR2Theme className="cr22-premium">
      <ConsumerAppHeader activeItem="planner" authState={authState} hasUnreadNotifications onNavigate={onNavigate} onLogin={onLogin} userName={user?.name} userTier={state === "ACTIVE" ? "premium" : user?.tier} />
      <ConsumerContainer as="main" id="main-content" className="cr22-premium__content">
        <p className="cr22-premium__context"><ConsumerIcon name="info" size={15} /> Premium Access Gate</p>
        <div className="cr22-premium__headings">
          <div>
            <h1>AI 기능은 <em>Premium 전용</em>입니다.</h1>
            <p>따라가요의 AI 기능을 사용하려면<br />Premium 테스트 플랜을 선택해 주세요.</p>
          </div>
          <h2><span aria-hidden="true">✦</span> 프리미엄으로 더 스마트한 라이딩 계획을 경험하세요.</h2>
        </div>

        {STATE_NOTICE[state] ? <section className={`cr22-premium__notice is-${state.toLowerCase()}`} role="status" aria-live="polite"><strong>{STATE_NOTICE[state][0]}</strong><span>{STATE_NOTICE[state][1]}</span></section> : null}

        <section className="cr22-premium__gate-grid" aria-label="무료 기능과 Premium AI 기능 비교">
          <section className="cr22-premium__free-panel" aria-labelledby="free-title">
            <h2 id="free-title">무료로 계속 사용할 수 있는 기능</h2>
            <ul>
              {FREE_FEATURES.map(([icon, title, description]) => <li key={title}><FeatureIcon name={icon} /><span><strong>{title}</strong><small>{description}</small></span></li>)}
            </ul>
          </section>

          <section className="cr22-premium__ai-panel" aria-labelledby="premium-title">
            <h2 id="premium-title"><span aria-hidden="true">AI</span> Premium에서만 제공되는 AI 기능</h2>
            <div className="cr22-premium__ai-features">
              {PREMIUM_FEATURES.map(([icon, title, description]) => <article key={title}><FeatureIcon name={icon} /><h3>{title}</h3><p>{description}</p></article>)}
            </div>
            <p className="cr22-premium__truth"><ConsumerIcon name="info" size={17} /> Premium은 따릉이 이용권이 아니라, 따라가요 서비스의 AI 접근 권한입니다.</p>
            <div className="cr22-premium__actions">
              <ConsumerButton block disabled={state === "PROCESSING"} loading={state === "PROCESSING"} loadingLabel="상태 확인 중…" onClick={primaryAction}>{primaryLabel}</ConsumerButton>
              <ConsumerButton block variant="secondary" onClick={onContinueFree}>무료 기능 계속 사용하기</ConsumerButton>
            </div>
            <p className="cr22-premium__cancel"><ConsumerIcon name="info" size={15} /> 자동 갱신이 없으며, 기간 종료 후에도 무료 기능은 계속 이용할 수 있습니다.</p>
          </section>
        </section>

        <section className="cr22-premium__benefit-strip" aria-label="Premium AI 기능 안내">
          <img src={bikeCutout} width="768" height="512" alt="" loading="lazy" />
          <div><strong>AI가 라이딩을 더 안전하고, 더 즐겁게.</strong><span>데이터와 AI로 당신의 라이딩 경험을 한 단계 업그레이드하세요.</span></div>
          {[["shield", "안전한 라이딩 지원"], ["weather", "실시간 환경 반영"], ["mapPin", "나에게 맞는 추천"], ["plan", "스마트한 일정 관리"]].map(([icon, label]) => <span className="cr22-premium__benefit" key={label}><FeatureIcon name={icon} /><small>{label}</small></span>)}
        </section>
      </ConsumerContainer>
    </ConsumerR2Theme>
  );
}

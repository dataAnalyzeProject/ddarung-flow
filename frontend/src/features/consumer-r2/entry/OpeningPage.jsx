import openingHero from "../../../assets/consumer-r2/opening/cr22-opening-hero-v2.webp";
import {
  ConsumerAppHeader,
  ConsumerButton,
  ConsumerContainer,
  ConsumerIcon,
  ConsumerR2Theme,
} from "../shared/index.js";
import "./entry.css";

export default function OpeningPage({
  authState = "anonymous",
  onLogin,
  onNavigate,
  onStart,
  user,
}) {
  return (
    <ConsumerR2Theme className="cr22-entry cr22-opening">
      <ConsumerAppHeader
        activeItem="home"
        authState={authState}
        onAccount={() => onNavigate?.("mypage")}
        onLogin={onLogin}
        onNavigate={onNavigate}
        userName={user?.displayName ?? user?.name}
        userTier={user?.tier?.toLowerCase()}
      />
      <main id="main-content" className="cr22-opening__main">
        <ConsumerContainer className="cr22-opening__layout">
          <section className="cr22-opening__copy" aria-labelledby="cr22-opening-title">
            <h1 id="cr22-opening-title">
              도착하기 전에,<br />
              <strong>따릉이 대여 가능성</strong>을 확인하세요
            </h1>
            <p>
              출발지와 빌릴 지역, 이동 방법과 필요한 자전거 수를 선택하면 도착할 때의 대여 가능성을 비교해요.
            </p>
            <ConsumerButton
              className="cr22-opening__cta"
              icon={<ConsumerIcon name="arrowRight" />}
              iconPosition="end"
              onClick={() => onStart?.()}
              size="lg"
            >
              대여 가능성 예측 시작하기
            </ConsumerButton>
          </section>

          <figure className="cr22-opening__visual">
            <img
              src={openingHero}
              alt=""
              aria-hidden="true"
              width="1600"
              height="800"
              fetchpriority="high"
            />
          </figure>
        </ConsumerContainer>
      </main>
    </ConsumerR2Theme>
  );
}

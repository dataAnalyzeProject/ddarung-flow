import openingHero from "../../../assets/consumer-r2/opening/cr22-opening-hero-v1.webp";
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
              도착할 시간과 필요한 자전거 수를 반영해 주변 대여소를 미리 비교할 수 있어요.
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
            <ul className="cr22-opening__facts" aria-label="서비스 안내">
              <li><ConsumerIcon name="mapPin" /><span>도착지 주변 대여소 비교</span></li>
              <li><ConsumerIcon name="plan" /><span>도착 시간 기준 예상</span></li>
              <li><ConsumerIcon name="bike" /><span>필요 자전거 수 반영</span></li>
            </ul>
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
            <figcaption>
              <span><ConsumerIcon name="check" />도착 시간과 조건을 입력하세요</span>
              <strong>주변 대여소의 대여 가능성을 한눈에 비교해요</strong>
            </figcaption>
          </figure>
        </ConsumerContainer>
      </main>
    </ConsumerR2Theme>
  );
}

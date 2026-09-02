import { useCallback, useEffect, useRef, useState } from "react";
import openingHero from "../../../assets/consumer-r2/opening/cr22-opening-hero-v1.webp";
import { hasSeenIntro, markIntroSeen } from "../../intro/introStorage.js";
import {
  ConsumerAppHeader,
  ConsumerButton,
  ConsumerContainer,
  ConsumerIcon,
  ConsumerR2Theme,
} from "../shared/index.js";
import "./entry.css";

const FIRST_VISIT_AUTO_ADVANCE_MS = 5000;

export default function OpeningPage({
  autoAdvanceMs = FIRST_VISIT_AUTO_ADVANCE_MS,
  onComplete,
  storage = window.localStorage,
}) {
  const [isRevisit] = useState(() => hasSeenIntro(storage));
  const completedRef = useRef(false);
  const timerRef = useRef(null);

  const completeOpening = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    markIntroSeen(storage);
    onComplete?.();
  }, [onComplete, storage]);

  useEffect(() => {
    if (isRevisit || autoAdvanceMs === null) return undefined;
    timerRef.current = window.setTimeout(completeOpening, autoAdvanceMs);
    return () => window.clearTimeout(timerRef.current);
  }, [autoAdvanceMs, completeOpening, isRevisit]);

  return (
    <ConsumerR2Theme className="cr22-entry cr22-opening">
      <ConsumerAppHeader activeItem="home" />
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
              onClick={completeOpening}
              size="lg"
            >
              {isRevisit ? "대여 예측 다시 시작하기" : "대여 가능성 예측 시작하기"}
            </ConsumerButton>
            <ul className="cr22-opening__facts" aria-label="서비스 안내">
              <li><ConsumerIcon name="mapPin" /><span>도착지 주변 대여소 비교</span></li>
              <li><ConsumerIcon name="plan" /><span>도착 시간 기준 예상</span></li>
              <li><ConsumerIcon name="bike" /><span>필요 자전거 수 반영</span></li>
            </ul>
            <p className="cr22-opening__visit-note" role="status" aria-live="polite">
              {isRevisit
                ? "이전에 안내를 확인했어요. 준비되면 바로 시작하세요."
                : `${Math.round(autoAdvanceMs / 1000)}초 후 자동으로 대여 예측을 시작합니다.`}
            </p>
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

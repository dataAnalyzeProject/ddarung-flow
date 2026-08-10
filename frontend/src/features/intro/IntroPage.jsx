import { useCallback, useEffect, useRef, useState } from "react";
import "./IntroPage.css";
import { markIntroSeen } from "./introStorage";

const INTRO_DURATION_MS = 5000;

export default function IntroPage({ onComplete, storage = window.localStorage }) {
  const completedRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(5);

  const completeIntro = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    markIntroSeen(storage);
    onComplete?.();
  }, [onComplete, storage]);

  useEffect(() => {
    const countdownId = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    const completeId = window.setTimeout(completeIntro, INTRO_DURATION_MS);

    return () => {
      window.clearInterval(countdownId);
      window.clearTimeout(completeId);
    };
  }, [completeIntro]);

  return (
    <main className="intro-page" aria-label="따릉이 서비스 첫 방문 안내">
      <header className="intro-header">
        <div className="intro-brand">
          <span>SEOUL BIKE</span>
          <strong>따릉이 도착 대여 예측</strong>
        </div>
        <p><i /> 목적지 도착 시점의 대여 가능성을 미리 확인해요</p>
      </header>

      <section className="intro-stage">
        <div className="intro-copy">
          <p className="intro-eyebrow">SEOUL BIKE PREDICT</p>
          <h1>도착할 때 빌릴 수 있는<br />따릉이를 미리 확인하세요.</h1>
          <p className="intro-description">
            목적지와 도착 예정시간을 기준으로 주변 대여소의 대여 가능성을 안내합니다.
          </p>

          <div className="intro-feature-grid" aria-label="예측 안내 기준">
            <article><b>도착시간 기준</b><span>현재가 아닌 도착 시각으로 확인</span></article>
            <article><b>필요 수량</b><span>1~5대 기준 가능성 비교</span></article>
            <article><b>높음·중간·낮음</b><span>확률과 등급을 함께 표시</span></article>
          </div>

          <button type="button" className="intro-start" onClick={completeIntro} autoFocus>
            바로 시작하기
          </button>
          <p className="intro-auto-copy">{secondsLeft}초 후 자동으로 메인 화면으로 이동합니다.</p>
        </div>

        <div className="intro-preview" aria-label="예측 결과 미리보기">
          <div className="intro-map">
            <span className="intro-road road-one" />
            <span className="intro-road road-two" />
            <i className="intro-pin pin-one">1</i>
            <i className="intro-pin pin-two">2</i>
          </div>
          <article className="intro-result-card">
            <span>도착 예정 18:20</span>
            <strong>주변 대여소 3곳의<br />가능성을 비교합니다.</strong>
            <b>높음</b>
          </article>
        </div>
      </section>

      <div className="intro-progress" aria-hidden="true">
        <span />
      </div>
    </main>
  );
}

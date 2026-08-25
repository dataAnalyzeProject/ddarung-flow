// PremiumGuideAccessPanel.jsx
import React from 'react';
import './PremiumGuideAccessPanel.css';
import { premiumPlansFixture } from './data/premiumGuideAccessFixture';
export default function PremiumGuideAccessPanel({
  accessState = 'FREE',
  onLogin,
  onSelectPlan,
  plans = premiumPlansFixture,
}) {
  const isProcessing = accessState === 'PROCESSING';
  // 요금제 선택 핸들러 (planCode만 객체로 감싸서 전달)
  const handlePlanClick = (planCode) => {
    if (isProcessing) return;
    onSelectPlan?.({ planCode });
  };
  return (
    <section className="premium-guide-panel" aria-labelledby="premium-guide-title">
      {/* 1. 상단 타이틀 영역 */}
      <header className="premium-guide-panel__header">
        <p className="premium-guide-panel__eyebrow">PREMIUM RIDING GUIDE</p>
        <h1 id="premium-guide-title" className="premium-guide-panel__title">
          라이딩 가이드 접근 안내
        </h1>
      </header>
      {/* 2. 상태별 안내 영역 (카드보다 먼저 표시) */}
      <div className="premium-guide-panel__status-section">
        {accessState === 'ANONYMOUS' && (
          <div className="premium-guide-panel__anonymous-box">
            <p className="premium-guide-panel__status-desc">
              <span role="img" aria-label="잠금" className="premium-guide-panel__lock-icon">🔒</span>
              로그인 후 상세 가이드를 볼 수 있습니다.
            </p>
            <button
              type="button"
              className="premium-guide-panel__login-btn"
              onClick={() => onLogin?.()}
            >
              로그인하고 계속
            </button>
          </div>
        )}
        {accessState === 'EXPIRED' && (
          <div className="premium-guide-panel__expired-box">
            <p className="premium-guide-panel__status-desc">
              이용 기간이 종료되었습니다. 계속 이용하시려면 요금제를 선택해 주세요.
            </p>
          </div>
        )}
        {accessState === 'PROCESSING' && (
          <div className="premium-guide-panel__processing-box">
            <p className="premium-guide-panel__status-desc">
              결제 확인 중입니다.
            </p>
          </div>
        )}
      </div>
      {/* 3. 요금제 카드 2열 영역 (ANONYMOUS가 아닐 때 노출) */}
      {accessState !== 'ANONYMOUS' && (
        <div className="premium-guide-panel__plans-grid">
          {plans.map((plan) => (
            <article key={plan.planCode} className="premium-guide-card">
              <h2 className="premium-guide-card__name">{plan.name}</h2>
              <p className="premium-guide-card__price">{plan.priceDuration}</p>
              <p className="premium-guide-card__policy">{plan.policyText}</p>
              <button
                type="button"
                className="premium-guide-card__action-btn"
                disabled={isProcessing}
                onClick={() => handlePlanClick(plan.planCode)}
              >
                {isProcessing ? `${plan.buttonLabel} (비활성)` : plan.buttonLabel}
              </button>
            </article>
          ))}
        </div>
      )}
      {/* 4. 하단 필수 배지 바 */}
      <footer className="premium-guide-panel__footer">
        <p className="premium-guide-panel__notice">
          SANDBOX TEST · 실제 결제·환불·정산은 제공하지 않습니다.
        </p>
      </footer>
    </section>
  );
}
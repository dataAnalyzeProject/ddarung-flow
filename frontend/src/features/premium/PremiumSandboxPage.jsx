import React, { useState, useEffect } from 'react';
import AppHeader from '../../shared/AppHeader';
import { fetchSubscription, startCheckout } from './subscriptionApi';
import { requestTossCheckout } from './tossCheckout';
import './PremiumSandboxPage.css';

export default function PremiumSandboxPage({
  authState,
  user,
  onNavigate,
  onLogout,
  onLogin,
  onSelectPlan,
}) {
  const [subscription, setSubscription] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [feedbackState, setFeedbackState] = useState(null);

  // 1. 구독 상태 조회
  useEffect(() => {
    if (authState === 'authenticated') {
      fetchSubscription()
        .then((data) => {
          setSubscription(data);
          if (data?.status === 'ACTIVE') {
            setFeedbackState({
              type: 'success',
              icon: '⭐',
              message: '프리미엄 멤버십을 이용 중입니다. 모든 프리미엄 혜택이 적용되고 있습니다.',
            });
          } else if (data?.status === 'EXPIRED') {
            setFeedbackState({
              type: 'warning',
              icon: '⌛',
              message: '멤버십 이용 기간이 만료되었습니다. 플랜을 선택하여 혜택을 이어가세요.',
            });
          }
        })
        .catch(() => setSubscription(null));
    }
  }, [authState]);

  // 2. 구독 결제 시작 핸들러
  const handleSubscribe = async (planCode) => {
    if (authState !== 'authenticated') {
      // 👈 화면을 강제로 넘기지 않고, 배너에 [로그인하기] 버튼을 달아서 제공!
      setFeedbackState({
        type: 'warning',
        icon: '🔒',
        message: '프리미엄 멤버십을 구독하시려면 로그인이 필요합니다.',
        action: {
          label: '로그인하기',
          onClick: () => {
            if (onLogin) onLogin();
            else window.location.assign(`/login?returnTo=${encodeURIComponent('#premium')}`);
          },
        },
      });
      return;
    }

    if (onSelectPlan) {
      onSelectPlan({ planCode });
      return;
    }

    setFeedbackState({
      type: 'info',
      icon: '⏳',
      message: '결제 요청을 안전하게 처리하고 있습니다. 잠시만 기다려 주세요…',
    });
    setCheckoutLoading(true);

    try {
      const checkout = await startCheckout(planCode);
      await requestTossCheckout(checkout, {
        onCancel: () => {
          setFeedbackState({
            type: 'warning',
            icon: 'ℹ️',
            message: '결제가 취소되었습니다. 원하실 때 언제든 다시 신청하실 수 있습니다.',
          });
          setCheckoutLoading(false);
        },
      });
    } catch (error) {
      if (error.message === 'PAYMENT_NOT_ENABLED') {
        setFeedbackState({
          type: 'info',
          icon: '🛠️',
          message: '현재 결제 시스템 점검 중입니다. 잠시 후 다시 이용해 주세요.',
        });
      } else {
        setFeedbackState({
          type: 'error',
          icon: '⚠️',
          message: '결제를 완료하지 못했습니다. 결제 수단 한도나 카드 상태를 확인해 주세요.',
        });
      }
      setCheckoutLoading(false);
    }
  };

  const isSubscribed = subscription?.status === 'ACTIVE';

  return (
    <div className="premium-sandbox-shell">
      <AppHeader authState={authState} user={user} onNavigate={onNavigate} onLogout={onLogout} />

      <main className="premium-sandbox-main">
        {/* 1. 상단 히어로 영역 */}
        <section className="premium-sandbox__hero">
          <span className="premium-sandbox__badge">DDARUNG FLOW MEMBERSHIP</span>
          <h1 className="premium-sandbox__title">
            기다림 없는 따릉이 여정,<br />
            <span>프리미엄 멤버십</span>으로 시작하세요
          </h1>
          <p className="premium-sandbox__desc">
            실시간 품절 예측부터 날씨·미세먼지 분석, 출퇴근 최적 경로까지 한 번에 누리세요.
          </p>

          {/* 내 현재 멤버십 현황 카드 */}
          <div className="premium-sandbox__status-card">
            <div className="premium-sandbox__status-info">
              <span className="premium-sandbox__status-label">현재 이용 중인 플랜</span>
              <strong className="premium-sandbox__status-plan">
                {isSubscribed ? `⭐ ${subscription.planName || '프리미엄 멤버십'}` : '무료 플랜 (Free)'}
              </strong>
            </div>
            {isSubscribed ? (
              <div className="premium-sandbox__status-badge active">이용 중</div>
            ) : (
              <div className="premium-sandbox__status-badge free">기본 혜택</div>
            )}
          </div>
        </section>

        {/* 2. 프리미엄 핵심 혜택 3종 그리드 */}
        <section className="premium-sandbox__benefits">
          <div className="premium-sandbox__benefit-card">
            <div className="premium-sandbox__benefit-icon">🎯</div>
            <h3>실시간 품절 확률 예측</h3>
            <p>90일간의 이동 패턴과 빅데이터를 분석하여 도착 시점의 대여 성공률을 15분 단위로 정밀 예측합니다.</p>
          </div>

          <div className="premium-sandbox__benefit-card">
            <div className="premium-sandbox__benefit-icon">🌤️</div>
            <h3>도착지 날씨 & 미세먼지</h3>
            <p>라이딩 출발 전, 도착지의 풍속, 강수 확률, 미세먼지 수치를 측정소 기준으로 실시간 분석합니다.</p>
          </div>

          <div className="premium-sandbox__benefit-card">
            <div className="premium-sandbox__benefit-icon">🚀</div>
            <h3>자전거 도로 최적 경로</h3>
            <p>안전한 자전거 전용 도로 우선 경로와 경사도, 도보 이동 시간을 반영한 최적의 코스를 안내합니다.</p>
          </div>
        </section>

        {/* 3. 요금제 플랜 카드 선택 영역 */}
        <section className="premium-sandbox__pricing">
          <div className="premium-sandbox__pricing-header">
            <h2>합리적인 멤버십 요금제</h2>
            <p>언제든 위약금 없이 자유롭게 해지할 수 있습니다</p>
          </div>

          {/* 👈 상태별 자연스러운 안내 알림 배너 (요금제 카드 바로 위 배치) */}
          {feedbackState && (
            <div className={`premium-feedback-banner ${feedbackState.type}`} role="status">
              <span className="premium-feedback-banner__icon">{feedbackState.icon}</span>
              <p className="premium-feedback-banner__text">{feedbackState.message}</p>
              {feedbackState.action && (
                <button
                  type="button"
                  className="premium-feedback-banner__action-btn"
                  onClick={feedbackState.action.onClick}
                >
                  {feedbackState.action.label}
                </button>
              )}
              <button
                type="button"
                className="premium-feedback-banner__close"
                aria-label="닫기"
                onClick={() => setFeedbackState(null)}
              >
                ✕
              </button>
            </div>
          )}

          <div className="premium-sandbox__plans-grid">
            {/* 월간 플랜 */}
            <div className={`premium-sandbox__plan-card ${isSubscribed ? 'current' : ''}`}>
              <div className="premium-sandbox__plan-head">
                <h3>프리미엄 월간</h3>
                <p className="premium-sandbox__plan-desc">30일 이용권 · 자동 갱신 없음</p>
              </div>
              <div className="premium-sandbox__plan-price">
                <strong>₩2,900</strong>
                <span>/ 30일</span>
              </div>
              <ul className="premium-sandbox__plan-features">
                <li>✓ 실시간 잔여 대여 성공률 예측 무제한</li>
                <li>✓ 라이딩 가이드 (날씨·미세먼지) 무제한</li>
                <li>✓ 대여소 즐겨찾기 최대 20개 저장</li>
                <li>✓ 30일 만료 후 자동 결제 없음</li>
              </ul>
              <button
                type="button"
                className="premium-sandbox__plan-btn"
                disabled={isSubscribed || checkoutLoading}
                onClick={() => handleSubscribe('MONTHLY')}
              >
                {isSubscribed ? '현재 이용 중' : checkoutLoading ? '연결 중…' : '월간 구독 시작하기'}
              </button>
            </div>

            {/* 연간 플랜 */}
            <div className={`premium-sandbox__plan-card premium-sandbox__plan-card--featured ${isSubscribed ? 'current' : ''}`}>
              <div className="premium-sandbox__plan-ribbon">🔥 365일 패스</div>
              <div className="premium-sandbox__plan-head">
                <h3>연간 멤버십</h3>
                <p className="premium-sandbox__plan-desc">1년 내내 끊김 없는 가장 경제적인 선택</p>
              </div>
              <div className="premium-sandbox__plan-price">
                <strong>₩29,000</strong>
                <span>/ 365일</span>
              </div>
              <ul className="premium-sandbox__plan-features">
                <li>✓ 월간 멤버십의 모든 프리미엄 혜택 포함</li>
                <li>✓ 365일 동안 추가 결제 없이 무제한 이용</li>
                <li>✓ 신규 기능 우선 체험 권한 제공</li>
                <li>✓ 1년 단위 자동 갱신</li>
              </ul>
              <button
                type="button"
                className="premium-sandbox__plan-btn premium-sandbox__plan-btn--featured"
                disabled={isSubscribed || checkoutLoading}
                onClick={() => handleSubscribe('ANNUAL')}
              >
                {isSubscribed ? '현재 이용 중' : checkoutLoading ? '연결 중…' : '연간 선택 (29,000원)'}
              </button>
            </div>
          </div>
        </section>

        {/* 5. 하단 신뢰 및 보안 보증 바 */}
        <footer className="premium-sandbox__trust">
          <div className="premium-sandbox__trust-item">
            <span>🔒</span>
            <p>토스페이먼츠 안전 결제 시스템 적용</p>
          </div>
          <div className="premium-sandbox__trust-item">
            <span>⚡</span>
            <p>결제 즉시 모든 프리미엄 기능 활성화</p>
          </div>
          <div className="premium-sandbox__trust-item">
            <span>🤝</span>
            <p>언제든 마이페이지에서 간편 해지</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
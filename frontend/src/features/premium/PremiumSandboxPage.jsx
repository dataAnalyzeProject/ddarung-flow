import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AppHeader from '../../shared/AppHeader';
import { premiumPlansFixture } from './data/premiumGuideAccessFixture';
import { fetchSubscription, startCheckout, confirmPayment } from './subscriptionApi';
import { requestTossCheckout } from './tossCheckout';
import './PremiumSandboxPage.css';

// 달력 날짜(Calendar Day) 기준 정석 D-Day 계산기
export function formatRemainingPeriod(endsAt) {
  if (!endsAt) return null;
  const now = new Date();
  const end = new Date(endsAt);

  // 1. 잘못된 날짜 형식 방어
  if (isNaN(end.getTime())) return null;

  // 2. 이미 시각 자체가 지나버린 과거 시점 방어
  if (end.getTime() <= now.getTime()) return '이용 기간 만료';

  const year = end.getFullYear();
  const month = String(end.getMonth() + 1).padStart(2, '0');
  const day = String(end.getDate()).padStart(2, '0');

  // 3. 순수 달력 일자(00:00:00) 기준 D-Day 계산
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return `오늘 만료 (${year}.${month}.${day}까지 이용 가능)`;
  return `남은 기간: D-${diffDays} (${year}.${month}.${day}까지 이용 가능)`;
}

export default function PremiumSandboxPage({
  accessState,
  authState = 'anonymous',
  user,
  plans = premiumPlansFixture,
  onNavigate,
  onLogout,
  onLogin,
  onSelectPlan,
}) {
  const [internalSubscription, setInternalSubscription] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customFeedback, setCustomFeedback] = useState(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState(null);

  // 최신 구독 상태 새로고침 헬퍼
  const refreshSubscription = useCallback(async () => {
    try {
      const data = await fetchSubscription();
      if (data) setInternalSubscription(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  // 0. 부모 제어 모드(Controlled): 부모의 accessState가 변경되면 자식 내부의 임시 선택 상태를 즉시 소멸 동기화
  useEffect(() => {
    if (accessState) {
      setSelectedPlanCode(null);
    }
  }, [accessState]);

  // 1. 초기 마운트 시 구독 조회 및 토스 결제 콜백(?payment=processing) 처리
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const paymentStatus = searchParams.get('payment');
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');

    // 토스 결제 완료 콜백 복귀 시 승인 요청 처리
    if (paymentStatus === 'processing' && paymentKey && orderId && amount) {
      setIsProcessing(true);
      confirmPayment({ paymentKey, orderId, amount })
        .then(async (confirmResult) => {
          // 1. 백엔드 결제 승인 확인
          if (confirmResult?.status === 'ACTIVE') {
            // 결제 성공 시 선택 임시 상태 소멸 ➔ 정식 보유 상태로 완전 승격
            setSelectedPlanCode(null);
            setInternalSubscription({ status: 'ACTIVE' });

            // 2. 백엔드 공식 상세 구독 객체(planId, endsAt) 후속 조회
            try {
              const latest = await fetchSubscription();
              if (latest) {
                setInternalSubscription(latest);
                setCustomFeedback({
                  type: 'success',
                  icon: '⭐',
                  message: 'Sandbox 테스트 플랜 결제가 완료되었습니다. 라이딩 가이드 접근 상태를 확인할 수 있습니다.',
                });
              } else {
                throw new Error('FETCH_FAILED');
              }
            } catch {
              const handleRetry = async () => {
                const refreshed = await refreshSubscription();
                if (refreshed) {
                  setCustomFeedback({
                    type: 'success',
                    icon: '⭐',
                    message: 'Sandbox 가이드 접근 상태가 성공적으로 동기화되었습니다.',
                  });
                } else {
                  setCustomFeedback({
                    type: 'error',
                    icon: '⚠️',
                    message: '상세 정보를 불러오지 못했습니다. 네트워크 상태를 확인한 후 다시 시도해 주세요.',
                    action: {
                      label: '다시 시도',
                      onClick: handleRetry,
                    },
                  });
                }
              };

              setCustomFeedback({
                type: 'warning',
                icon: 'ℹ️',
                  message: 'Sandbox 결제는 정상 승인되었습니다. 가이드 접근 상세를 불러오지 못하면 상태 새로고침을 눌러주세요.',
                action: {
                  label: '상태 새로고침',
                  onClick: handleRetry,
                },
              });
            }
          } else {
            throw new Error('PAYMENT_VERIFICATION_FAILED');
          }
        })
        .catch(() => {
          setSelectedPlanCode(null);
          setCustomFeedback({
            type: 'error',
            icon: '⚠️',
            message: '결제 승인 처리 중 오류가 발생했습니다. 고객센터로 문의해 주세요.',
          });
        })
        .finally(() => {
          setIsProcessing(false);
          // 브라우저 URL에서 결제 파라미터 정리
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('payment');
          cleanUrl.searchParams.delete('paymentKey');
          cleanUrl.searchParams.delete('orderId');
          cleanUrl.searchParams.delete('amount');
          window.history.replaceState({}, '', cleanUrl.toString());
        });
      return;
    }

    if (paymentStatus === 'failed') {
      setSelectedPlanCode(null); // 결제 실패 복귀 시 선택 상태 초기화
      setCustomFeedback({
        type: 'error',
        icon: '⚠️',
        message: '결제가 취소되었거나 승인에 실패했습니다. 다시 시도해 주세요.',
      });
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('payment');
      cleanUrl.searchParams.delete('code');
      cleanUrl.searchParams.delete('message');
      window.history.replaceState({}, '', cleanUrl.toString());
      return;
    }

    // 일반 진입 시 구독 정보 조회
    if (authState === 'authenticated' && !accessState) {
      refreshSubscription();
    }
  }, [authState, accessState, refreshSubscription]);

  // 2. 📌 단일 진실 원천 (Single Source of Truth) 도출
  const effectiveStatus = useMemo(() => {
    if (accessState) return accessState;
    if (isProcessing) return 'PROCESSING';
    if (authState !== 'authenticated') return 'ANONYMOUS';
    if (internalSubscription?.status === 'ACTIVE') return 'ACTIVE';
    if (internalSubscription?.status === 'EXPIRED') return 'EXPIRED';
    return 'FREE';
  }, [accessState, isProcessing, authState, internalSubscription]);

  const isSubscribed = effectiveStatus === 'ACTIVE';
  const isBusy = effectiveStatus === 'PROCESSING' || isProcessing;

  // 부모의 user.subscription 또는 내부 internalSubscription 통합 참조
  const activePlanId = internalSubscription?.planId || user?.subscription?.planId;
  const activeEndsAt = internalSubscription?.endsAt || user?.subscription?.endsAt;
  const hasSubscriptionDetails = Boolean(activePlanId && activeEndsAt);

  // 3. 상태에 따른 통합 피드백 배너 정보 계산
  const feedback = useMemo(() => {
    if (customFeedback) return customFeedback;

    switch (effectiveStatus) {
      case 'PROCESSING':
        return {
          type: 'info',
          icon: '⏳',
          message: 'Sandbox 테스트 결제 요청을 처리하고 있습니다. 잠시만 기다려 주세요…',
        };
      case 'ACTIVE':
        return {
          type: 'success',
          icon: '⭐',
          message: 'Sandbox 라이딩 가이드 접근 상태가 활성화되었습니다. 실제 따릉이 이용권 구매는 아닙니다.',
        };
      case 'EXPIRED':
        return {
          type: 'warning',
          icon: '⌛',
          message: 'Sandbox 가이드 접근 기간이 만료되었습니다. 실제 따릉이 이용 자격과는 관계없습니다.',
        };
      case 'ANONYMOUS':
        return null;
      default:
        return null;
    }
  }, [customFeedback, effectiveStatus]);

  // 4. 결제 액션 디스패처 (부모 위임 vs 자체 결제 실행 분리)
  const handlePlanSelect = async (planCode) => {
    setSelectedPlanCode(planCode);

    if (effectiveStatus === 'ANONYMOUS') {
      setCustomFeedback({
        type: 'warning',
        icon: '🔒',
        message: 'Sandbox 테스트 플랜을 결제하려면 로그인이 필요합니다.',
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

    // 부모(MainPage 등)에서 결제 제어권을 넘겨받은 경우 위임 (상태 종료는 부모 accessState 전이가 책임)
    if (onSelectPlan) {
      onSelectPlan({ planCode });
      return;
    }

    // 독립 페이지 모드: 자체 토스 결제 프로세스 실행 (종료 책임: 자신이 직접 가짐)
    setCustomFeedback(null);
    setIsProcessing(true);

    try {
      const checkout = await startCheckout(planCode);
      await requestTossCheckout(checkout, {
        onCancel: () => {
          setSelectedPlanCode(null); // 결제 취소 시 선택 상태 즉시 해제 (미보유 복귀)
          setCustomFeedback({
            type: 'warning',
            icon: 'ℹ️',
            message: '결제가 취소되었습니다. 언제든 다시 신청하실 수 있습니다.',
          });
          setIsProcessing(false);
        },
      });
    } catch (error) {
      setSelectedPlanCode(null); // 오류 발생 시 선택 상태 해제
      if (error.message === 'PAYMENT_NOT_ENABLED') {
        setCustomFeedback({
          type: 'info',
          icon: '🛠️',
          message: '현재 결제 시스템 점검 중입니다. 잠시 후 다시 이용해 주세요.',
        });
      } else {
        setCustomFeedback({
          type: 'error',
          icon: '⚠️',
          message: '결제를 완료하지 못했습니다. 결제 수단 한도나 카드 상태를 확인해 주세요.',
        });
      }
      setIsProcessing(false);
    }
  };

  const currentPlan = plans.find((p) => p.planCode === activePlanId);
  const selectedPlan = plans.find((p) => p.planCode === selectedPlanCode);

  const planDisplayName =
    currentPlan?.name ||
    internalSubscription?.planName ||
    (isSubscribed ? '라이딩 가이드 테스트 플랜 (활성)' : '미보유 (테스트 플랜 결제 필요)');

  return (
    <div className="premium-sandbox-shell">
      <AppHeader authState={authState} user={user} onNavigate={onNavigate} onLogout={onLogout} />

      <main className="premium-sandbox-main">
        {/* 1. 상단 히어로 영역 */}
        <section className="premium-sandbox__hero">
          <span className="premium-sandbox__badge">SANDBOX TEST · 실제 과금 없음</span>
          <h1 className="premium-sandbox__title">
            라이딩 가이드 접근 흐름을,<br />
            <span>Sandbox 테스트 플랜</span>으로 확인하세요
          </h1>
          <p className="premium-sandbox__desc">
            Toss sandbox checkout과 가이드 접근 상태를 검증합니다. 실제 따릉이 이용권 구매나 실제 과금은 아닙니다.
          </p>

          {/* 내 현재 이용권 현황 카드 (선택한 이용권 & 보유 이용권 통합 노출) */}
          <div className="premium-sandbox__status-card">
            <div className="premium-sandbox__status-info">
              <span className="premium-sandbox__status-label">
                {isSubscribed ? '현재 sandbox 가이드 접근 상태' : selectedPlan ? '선택한 테스트 플랜' : '현재 sandbox 가이드 접근 상태'}
              </span>
              <strong className="premium-sandbox__status-plan">
                {isSubscribed
                  ? `⭐ ${planDisplayName}`
                  : selectedPlan
                  ? `👉 ${selectedPlan.name} (${selectedPlan.priceDuration || `${selectedPlan.duration} · ${selectedPlan.price}`})`
                  : '미보유 (테스트 플랜 결제 필요)'}
              </strong>
              {/* 남은 기간 및 만료일 표시: 상세 정보(endsAt)가 온전히 확보되었을 때만 렌더링 */}
              {isSubscribed && hasSubscriptionDetails && (
                <span className="premium-sandbox__status-expiry">
                  📅 {formatRemainingPeriod(activeEndsAt)}
                </span>
              )}
            </div>
            {isSubscribed ? (
              <div className="premium-sandbox__status-badge active">가이드 접근 활성</div>
            ) : isBusy ? (
              <div className="premium-sandbox__status-badge processing">연결 중…</div>
            ) : (
              <div className="premium-sandbox__status-badge free">미보유</div>
            )}
          </div>
        </section>

        {/* 2. Sandbox 범위 안내 */}
        <section className="premium-sandbox__benefits">
          <div className="premium-sandbox__benefit-card">
            <div className="premium-sandbox__benefit-icon">🚲</div>
            <h3>라이딩 가이드 접근 테스트</h3>
            <p>따라가요 라이딩 가이드 화면의 접근 상태와 표시 흐름을 확인합니다.</p>
          </div>

          <div className="premium-sandbox__benefit-card">
            <div className="premium-sandbox__benefit-icon">🔄</div>
            <h3>실제 이용권 구매 아님</h3>
            <p>서울자전거 따릉이 이용 자격이나 대여 권한을 제공하지 않습니다.</p>
          </div>

          <div className="premium-sandbox__benefit-card">
            <div className="premium-sandbox__benefit-icon">🎯</div>
            <h3>Toss sandbox 상태 검증</h3>
            <p>테스트 금액, checkout callback, ACTIVE·EXPIRED 상태 전이를 확인합니다.</p>
          </div>
        </section>

        {/* 3. 요금제 플랜 카드 선택 영역 */}
        <section className="premium-sandbox__pricing">
          <div className="premium-sandbox__pricing-header">
            <h2>라이딩 가이드 sandbox 테스트 플랜</h2>
            <p>30일 또는 365일 테스트 플랜으로 checkout과 가이드 접근 상태를 확인합니다.</p>
          </div>

          {/* 상태별 실시간 안내 알림 배너 */}
          {feedback && (
            <div className={`premium-feedback-banner ${feedback.type}`} role="status">
              <span className="premium-feedback-banner__icon">{feedback.icon}</span>
              <p className="premium-feedback-banner__text">{feedback.message}</p>
              {feedbackStateAction(feedback.action)}
              <button
                type="button"
                className="premium-feedback-banner__close"
                aria-label="닫기"
                onClick={() => setCustomFeedback(null)}
              >
                ✕
              </button>
            </div>
          )}

          <div className="premium-sandbox__plans-grid">
            {plans.map((plan) => {
              const isCurrentPlan = activePlanId === plan.planCode;

              return (
                <div
                  key={plan.planCode}
                  data-testid={`plan-card-${plan.planCode}`}
                  className={`premium-sandbox__plan-card ${plan.isFeatured ? 'premium-sandbox__plan-card--featured' : ''} ${isCurrentPlan ? 'current' : ''}`}
                >
                  {plan.isFeatured && <div className="premium-sandbox__plan-ribbon">🔥 365일 패스</div>}
                  <div className="premium-sandbox__plan-head">
                    <h3>{plan.name}</h3>
                    <p className="premium-sandbox__plan-desc">{plan.duration} 테스트 기간 · {plan.policyText}</p>
                  </div>
                  <div className="premium-sandbox__plan-price">
                    <strong>{plan.price}</strong>
                    <span>/ {plan.duration}</span>
                  </div>
                  <ul className="premium-sandbox__plan-features">
                    {plan.features.map((feature, idx) => (
                      <li key={idx}>✓ {feature}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`premium-sandbox__plan-btn ${plan.isFeatured ? 'premium-sandbox__plan-btn--featured' : ''}`}
                    disabled={isSubscribed || isBusy}
                    onClick={() => handlePlanSelect(plan.planCode)}
                  >
                    {isSubscribed ? '가이드 접근 활성' : isBusy ? '연결 중…' : plan.buttonLabel}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. 하단 신뢰 및 보안 보증 바 */}
        <footer className="premium-sandbox__trust">
          <div className="premium-sandbox__trust-item">
            <span>🔒</span>
            <p>토스페이먼츠 sandbox 테스트 결제</p>
          </div>
          <div className="premium-sandbox__trust-item">
            <span>⚡</span>
            <p>결제 후 sandbox 가이드 접근 상태 활성화</p>
          </div>
          <div className="premium-sandbox__trust-item">
            <span>🤝</span>
            <p>실제 따릉이 이용권 구매·실제 과금 없음</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

function feedbackStateAction(action) {
  if (!action) return null;
  return (
    <button
      type="button"
      className="premium-feedback-banner__action-btn"
      onClick={action.onClick}
    >
      {action.label}
    </button>
  );
}

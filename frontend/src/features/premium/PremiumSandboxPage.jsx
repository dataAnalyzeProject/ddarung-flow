import React from 'react';
import './PremiumSandboxPage.css';

export default function PremiumSandboxPage({
    status = 'PREPARING',
    subscription = null,
    onCheckout,
    onCallbackResult,
    onRefreshSubscription,
    onRetry,
}) {
    return (
    <div className="premium-sandbox-wrapper">
        <header className="premium-sandbox__main-header">
          <div className="premium-sandbox__header-brand">
            <span>SEOUL BIKE</span>
            <span className="premium-sandbox__header-divider">|</span>
            <span>따릉이 도착 대여 예측</span>
          </div>
          <div className="premium-sandbox__header-nav">
            <span>대여 예측</span>
            <span>Q&A</span>
            <span>보관함</span>
            <span>알림</span>
            <button type="button" className="premium-sandbox__header-login-btn">로그인</button>
          </div>
        </header>
<main className="premium-sandbox" data-status={status}>
    <div className="premium-sandbox__header-title">
        <p className="premium-sandbox__subtitle">PREMIUM SANDBOX</p>
        <h1>프리미엄 30일 sandbox 체험</h1>
    </div>
    <div className="premium-sandbox__notice-banner">
        <span>SANDBOX TEST · 실제 결제 없음</span>
    </div>
            <div className="premium-sandbox__container">

                {/* 일관된 결제 카드 구조 유지 + 버튼만 disabled */}
                {status === 'PAYMENT_NOT_ENABLED' && (
                    <div className="premium-sandbox__card">
                        <h2>프리미엄 구독 결제</h2>
                        <p>현재 프리미엄 결제 기능을 이용할 수 없습니다.</p>
                        <button type="button" disabled>
                        결제 사용 불가
                        </button>
                    </div>
                )}

                {status === 'PREPARING' && (
                    <div className="premium-sandbox__card">
                        <h2>프리미엄 구독 결제</h2>
                        <p>대여 예측 및 맞춤 알림 서비스를 이용해보세요.</p>

                        <button
                            type="button"
                            onClick={onCheckout}
                        >
                            결제하기
                        </button>
                    </div>
                )}

                {status === 'PROCESSING' && (
                    <div className="premium-sandbox__card">
                        <h2>결제 처리 중...</h2>
                        <p>잠시만 기다려주세요.</p>

                        <button
                            type="button"
                            disabled
                        >
                            처리 중...
                        </button>
                    </div>
                )}

                {status === 'SUCCESS' && (
          <div className="premium-sandbox__card">
            <h2>결제 성공</h2>
            {subscription && (
              <div className="premium-sandbox__sub-info">
                <p>플랜: {subscription.plan || '프리미엄 플랜'}</p>
                <p>상태: {subscription.status || 'ACTIVE'}</p>
              </div>
            )}
            <div className="premium-sandbox__actions">
              <button type="button" onClick={onRefreshSubscription}>
                구독 상태 갱신
              </button>
            </div>
          </div>
                )}
                {status === 'CANCELLED' && (
          <div className="premium-sandbox__card">
            <h2>결제가 취소되었습니다</h2>
            <div className="premium-sandbox__actions">
              <button type="button" onClick={onRetry}>
                다시 시도
              </button>
            </div>
          </div>
                )}
                {status === 'FAILED' && (
                    <div className="premium-sandbox__card">
                        <h2>결제 실패</h2>
                        <button
                            type="button"
                            onClick={onRetry}
                        >
                            다시 시도
                        </button>
                    </div>
                )}
            </div>
        </main>
    </div>
    );
}
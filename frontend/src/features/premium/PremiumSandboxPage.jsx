import React, { useState, useCallback, useEffect, useRef } from 'react';
import './PremiumSandboxPage.css';

// 6가지 상태별 우측 카드 안내 문구 매핑
const STATUS_DETAILS = {
  PREPARING: {
    title: '결제 준비',
    description: '테스트 checkout을 시작할 수 있습니다. 실제 결제사 API에는 요청하지 않습니다.',
    hint: 'PREPARING: 버튼 클릭 시 onCheckout callback을 확인합니다.',
  },
  PROCESSING: {
    title: '처리 중',
    description: '중복 시작을 막고 callback 결과를 기다리는 fixture 상태입니다.',
    hint: 'PROCESSING: 버튼이 disabled이며 어떠한 callback도 발생하지 않습니다.',
  },
  SUCCESS: {
    title: 'sandbox 완료',
    description: 'fixture 구독 상태만 표시합니다. 실제 구독·과금은 생성하지 않습니다.',
    hint: 'SUCCESS: 결과 진입 시 onCallbackResult, 버튼 클릭 시 onRefreshSubscription callback을 확인합니다.',
  },
  CANCELLED: {
    title: '사용자 취소',
    description: '테스트 흐름이 취소된 상태입니다. 실제 주문은 없습니다.',
    hint: 'CANCELLED: 결과 진입 시 onCallbackResult, 버튼 클릭 시 onRetry callback을 확인합니다.',
  },
  FAILED: {
    title: '테스트 실패',
    description: '안전한 오류 안내만 표시합니다. 오류 원문이나 비밀값은 표시하지 않습니다.',
    hint: 'FAILED: 결과 진입 시 onCallbackResult, 버튼 클릭 시 onRetry callback을 확인합니다.',
  },
  PAYMENT_NOT_ENABLED: {
    title: '운영 결제 비활성',
    description: '이 환경에서는 결제를 시작할 수 없습니다. 실제 결제 기능은 제공하지 않습니다.',
    hint: 'PAYMENT_NOT_ENABLED: 결제 비활성 상태로 어떠한 callback도 호출하지 않습니다.',
  },
};

export default function PremiumSandboxPage({
    status = 'PREPARING',
    subscription = null,
    onCheckout,
    onCallbackResult,
    onRefreshSubscription,
    onRetry,
}) {

     const currentDetail = STATUS_DETAILS[status] ?? STATUS_DETAILS.PREPARING;
  // 1. 실시간 callback 호출 카운트 상태 관리
  const [callbackCounts, setCallbackCounts] = useState({
    checkout: 0,
    callbackResult: 0,
    refresh: 0,
    retry: 0,
  });

   // 2. 버튼 클릭 핸들러들
  const handleCheckout = useCallback(() => {
    setCallbackCounts(prev => ({ ...prev, checkout: prev.checkout + 1 }));
    onCheckout?.();
  }, [onCheckout]);
  const handleCallbackResult = useCallback(() => {
        setCallbackCounts(prev => ({ ...prev, callbackResult: prev.callbackResult + 1 }));
        onCallbackResult?.(status);
  }, [onCallbackResult, status]);
  const handleRefreshSubscription = useCallback(() => {
    setCallbackCounts(prev => ({ ...prev, refresh: prev.refresh + 1 }));
    onRefreshSubscription?.();
  }, [onRefreshSubscription]);
  const handleRetry = useCallback(() => {
    setCallbackCounts(prev => ({ ...prev, retry: prev.retry + 1 }));
    onRetry?.();
  }, [onRetry]);

    // 3. 결과 상태(SUCCESS, CANCELLED, FAILED) 진입 시 onCallbackResult 카운트 & 호출
    const lastReportedStatusRef = useRef(null);
  useEffect(() => {
    if (
      lastReportedStatusRef.current !== status &&
      ['SUCCESS', 'CANCELLED', 'FAILED'].includes(status)
    ) {
      handleCallbackResult(); 
    }
    lastReportedStatusRef.current = status;
  }, [status, handleCallbackResult]);
  return (
    <main className="premium-sandbox" data-status={status}>
      {/* 1. 상단 타이틀 영역 */}
      <div className="premium-sandbox__header-title">
        <p className="premium-sandbox__subtitle">PREMIUM SANDBOX</p>
        <h1>프리미엄 30일 sandbox 체험</h1>
        <p className="premium-sandbox__desc">
          이 화면은 테스트용 상태 UI입니다. 실제 결제와 과금은 진행되지 않습니다.
        </p>
      </div>
      {/* 2. 필수 공통 안전 배지 바 */}
      <div className="premium-sandbox__notice-banner">
        <span>SANDBOX TEST · 실제 결제 없음</span>
        <span className="premium-sandbox__status-badge">{status}</span>
      </div>
      {/* 3. 본문 2열 카드 영역 */}
      <div className="premium-sandbox__container">
        {/* 좌측 카드: 테스트 상품 */}
        <div className="premium-sandbox__card">
          <h2>테스트 상품</h2>
          <p className="premium-sandbox__card-subtitle">테스트 fixture에서만 표시하는 고정 정보</p>
          <div className="premium-sandbox__product-box">
            <h3>프리미엄 30일 sandbox 체험</h3>
            <p>테스트 상태 확인용 · 실제 결제 수단 입력 없음</p>
          </div>
          <div className="premium-sandbox__action-area">
            {status === 'PREPARING' && (
              <button type="button" onClick={handleCheckout}>
                sandbox checkout 시작
              </button>
            )}
            {status === 'PROCESSING' && (
              <button type="button" disabled>
                처리 중...
              </button>
            )}
            {status === 'SUCCESS' && (
              <button type="button" onClick={handleRefreshSubscription}>
                구독 상태 새로고침
              </button>
            )}
            {status === 'CANCELLED' && (
              <button type="button" onClick={handleRetry}>
                다시 시도
              </button>
            )}
            {status === 'FAILED' && (
              <button type="button" onClick={handleRetry}>
                다시 시도
              </button>
            )}
            {status === 'PAYMENT_NOT_ENABLED' && (
              <button type="button" disabled>
                결제 사용 불가
              </button>
            )}
          </div>
          <p className="premium-sandbox__hint">{currentDetail.hint}</p>
        </div>
        {/* 우측 카드: 현재 상태 & 실시간 callback 카운트 관찰기 */}
        <div className="premium-sandbox__card">
          <h2>현재 상태</h2>
          <div className="premium-sandbox__sub-info">
            <h3>{currentDetail.title}</h3>
            <p>{currentDetail.description}</p>
            {status === 'SUCCESS' && subscription && (
              <div className="premium-sandbox__subscription-details">
                <p>플랜: {subscription.plan || '프리미엄 플랜'}</p>
                <p>상태: {subscription.status || 'ACTIVE'}</p>
              </div>
            )}
          </div>
          <div className="premium-sandbox__callback-section">
            <p className="premium-sandbox__callback-title">테스트에서 확인할 callback</p>
            <div className="premium-sandbox__callback-counts">
              <span>onCheckout: {callbackCounts.checkout}회</span>
              <span> · </span>
              <span>onCallbackResult: {callbackCounts.callbackResult}회</span>
              <span> · </span>
              <span>onRefreshSubscription: {callbackCounts.refresh}회</span>
              <span> · </span>
              <span>onRetry: {callbackCounts.retry}회</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
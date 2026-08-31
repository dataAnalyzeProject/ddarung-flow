import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import PremiumSandboxPage, { formatRemainingPeriod } from './PremiumSandboxPage';
import { premiumPlansFixture } from './data/premiumGuideAccessFixture';
import * as subscriptionApi from './subscriptionApi';
import * as tossCheckout from './tossCheckout';

// API 모듈 Mocking
jest.mock('./subscriptionApi');
jest.mock('./tossCheckout');

describe('PremiumSandboxPage 정밀 단위 테스트 스위트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  // 1. 비로그인(ANONYMOUS) 상태: Fixture 버튼 문구 렌더링 및 로그인 유도 검증
  test('비로그인 상태에서 Fixture의 버튼 문구가 정확히 표시되고, 클릭 시 로그인 안내 배너와 로그인하기 버튼이 동작한다', () => {
    const onLogin = jest.fn();
    render(<PremiumSandboxPage authState="anonymous" onLogin={onLogin} />);

    const monthlyBtn = screen.getByRole('button', { name: premiumPlansFixture[0].buttonLabel });
    expect(monthlyBtn).toBeInTheDocument();
    expect(monthlyBtn.textContent).toContain('30일 테스트 플랜 결제하기');

    fireEvent.click(monthlyBtn);
    expect(screen.getByText('Sandbox 테스트 플랜을 결제하려면 로그인이 필요합니다.')).toBeInTheDocument();

    const loginActionBtn = screen.getByRole('button', { name: '로그인하기' });
    fireEvent.click(loginActionBtn);
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  // 2. FREE 상태: 요금제 카드별 세부 혜택 목록(features) 렌더링 및 onSelectPlan 위임 검증
  test('FREE 상태에서 각 플랜의 가격과 혜택 목록(features)이 렌더링되고 onSelectPlan에 올바른 planCode가 전달된다', () => {
    const onSelectPlan = jest.fn();
    render(
      <PremiumSandboxPage
        authState="authenticated"
        accessState="FREE"
        onSelectPlan={onSelectPlan}
      />
    );

    expect(screen.getAllByText('✓ 실제 따릉이 이용권 구매 또는 이용 자격을 부여하지 않음')).toHaveLength(2);
    expect(screen.getByText('SANDBOX TEST · 실제 과금 없음')).toBeInTheDocument();
    expect(screen.getByText('실제 이용권 구매 아님')).toBeInTheDocument();
    expect(screen.getByText('✓ Toss checkout·callback·구독 상태 전이 검증')).toBeInTheDocument();

    const monthlyBtn = screen.getByRole('button', { name: premiumPlansFixture[0].buttonLabel });
    fireEvent.click(monthlyBtn);
    expect(onSelectPlan).toHaveBeenCalledWith({ planCode: 'PREMIUM_MONTHLY_30D' });

    const yearlyBtn = screen.getByRole('button', { name: premiumPlansFixture[1].buttonLabel });
    fireEvent.click(yearlyBtn);
    expect(onSelectPlan).toHaveBeenCalledWith({ planCode: 'PREMIUM_YEARLY_365D' });
  });

  // 3. 🧪 [달력 날짜 기준 D-Day 계산 및 엣지 케이스 정밀 테스트 (시간 고정 환경)]
  describe('formatRemainingPeriod 순수 달력 날짜(Calendar Day) 기준 D-Day 계산 검증', () => {
    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-28T01:00:00.000Z'));
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    test('오늘 당일(2026-08-28) 만료 시점의 경우 "오늘 만료"로 정확히 표시된다', () => {
      const tonight = new Date('2026-08-28T14:59:59.000Z').toISOString();
      expect(formatRemainingPeriod(tonight)).toBe('오늘 만료 (2026.08.28까지 이용 가능)');
    });

    test('내일(2026-08-29) 만료 시점의 경우 D-1로 정확히 계산된다', () => {
      const tomorrow = new Date('2026-08-29T14:59:59.000Z').toISOString();
      expect(formatRemainingPeriod(tomorrow)).toBe('남은 기간: D-1 (2026.08.29까지 이용 가능)');
    });

    test('30일 뒤(2026-09-27) 만료 시점의 경우 D-30으로 정확히 계산된다', () => {
      const thirtyDaysLater = new Date('2026-09-27T01:00:00.000Z').toISOString();
      expect(formatRemainingPeriod(thirtyDaysLater)).toContain('남은 기간: D-30');
    });

    test('이미 지난 과거 시점(-10분 전)인 경우 "이용 기간 만료"로 반환된다', () => {
      const tenMinutesAgo = new Date('2026-08-28T00:50:00.000Z').toISOString();
      expect(formatRemainingPeriod(tenMinutesAgo)).toBe('이용 기간 만료');
    });

    test('잘못된 날짜 문자열 또는 null 입력 시 null을 반환하여 크래시를 방지한다', () => {
      expect(formatRemainingPeriod('invalid-date')).toBeNull();
      expect(formatRemainingPeriod(null)).toBeNull();
      expect(formatRemainingPeriod(undefined)).toBeNull();
    });
  });

  // 4. [백엔드 SSOT 중심 E2E 라이프사이클 및 특정 플랜 카드 current 하이라이트 검증]
  test('토스 콜백 복귀 시 confirmPayment 승인 후 fetchSubscription을 통해 해당 플랜 카드에만 current가 부여된다', async () => {
    window.history.replaceState({}, '', '/?payment=processing&paymentKey=test-key-365&orderId=order-365&amount=29000#premium');

    subscriptionApi.confirmPayment.mockResolvedValueOnce({ status: 'ACTIVE' });
    subscriptionApi.fetchSubscription.mockResolvedValueOnce({
      status: 'ACTIVE',
      planId: 'PREMIUM_YEARLY_365D',
      endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    render(<PremiumSandboxPage authState="authenticated" />);

    await waitFor(() => {
      expect(subscriptionApi.confirmPayment).toHaveBeenCalledWith({
        paymentKey: 'test-key-365',
        orderId: 'order-365',
        amount: '29000',
      });
    });

    // 백엔드 데이터 수신 및 특정 카드 current 분리 검증
    await waitFor(() => {
      expect(subscriptionApi.fetchSubscription).toHaveBeenCalled();
      expect(screen.getAllByText('가이드 접근 활성')).toHaveLength(3);
      const statusCard = document.querySelector('.premium-sandbox__status-card');
      expect(within(statusCard).getByText(/365일 라이딩 가이드 테스트 플랜/)).toBeInTheDocument();

      const yearlyCard = screen.getByTestId('plan-card-PREMIUM_YEARLY_365D');
      const monthlyCard = screen.getByTestId('plan-card-PREMIUM_MONTHLY_30D');
      expect(yearlyCard).toHaveClass('current');
      expect(monthlyCard).not.toHaveClass('current');
    });

    expect(window.location.search).toBe('');
  });

  // 5. [선택 및 취소 라이프사이클 검증]: 결제 진행 중 선택한 이용권 표시 ➔ 취소 시 선택 정보 초기화 및 미보유 복귀
  test('결제 시작 시 상단 카드에 선택한 이용권과 priceDuration이 표시되고, 결제 취소 시 선택 정보가 초기화되어 미보유 상태로 복귀한다', async () => {
    subscriptionApi.startCheckout.mockResolvedValueOnce({
      orderId: 'order-cancel-test',
      amount: 29000,
      customerKey: 'cust-cancel',
    });

    let capturedOnCancel = null;
    tossCheckout.requestTossCheckout.mockImplementationOnce((_checkout, callbacks) => {
      capturedOnCancel = callbacks?.onCancel;
      return Promise.resolve();
    });

    render(<PremiumSandboxPage authState="authenticated" accessState="FREE" />);

    // 1) 365일권 결제 클릭 ➔ 상단 카드에 '선택한 이용권: 👉 따릉이 365일 정기권 (365일 · 29,000원)' 표시 확인
    const yearlyBtn = screen.getByRole('button', { name: premiumPlansFixture[1].buttonLabel });
    fireEvent.click(yearlyBtn);

    const statusCard = document.querySelector('.premium-sandbox__status-card');
    expect(within(statusCard).getByText('선택한 테스트 플랜')).toBeInTheDocument();
    expect(within(statusCard).getByText(/365일 라이딩 가이드 테스트 플랜 \(365일 · 29,000원\)/)).toBeInTheDocument();

    // 2) 토스 SDK 호출 대기 후 취소(onCancel) 콜백 실행
    await waitFor(() => {
      expect(tossCheckout.requestTossCheckout).toHaveBeenCalled();
    });

    act(() => {
      capturedOnCancel();
    });

    // 3) 취소 후: 상단 카드에서 선택된 이용권 정보가 초기화되고 '미보유 (이용권 결제 필요)'로 안전 복귀 확인!
    await waitFor(() => {
      expect(within(statusCard).getByText('미보유 (테스트 플랜 결제 필요)')).toBeInTheDocument();
      expect(within(statusCard).queryByText('선택한 테스트 플랜')).not.toBeInTheDocument();
      expect(screen.getByText(/결제가 취소되었습니다/)).toBeInTheDocument();
    });
  });

  // 6. [부모 위임 제어 검증]: onSelectPlan 위임 후 부모의 accessState 전이에 따른 선택 상태의 완전 소멸 및 보유 상품 일치 검증
  test('onSelectPlan으로 부모에게 위임 시 선택 상태가 표시되었다가, 부모의 accessState가 ACTIVE로 전환되면 선택 상태가 소멸하고 해당 30일권 보유 상태가 정확히 표시된다', () => {
    const onSelectPlan = jest.fn();
    const { rerender } = render(
      <PremiumSandboxPage
        authState="authenticated"
        accessState="FREE"
        onSelectPlan={onSelectPlan}
      />
    );

    // 1) 30일권 클릭 ➔ 상단 카드에 '선택한 이용권: 👉 따릉이 30일 정기권 (30일 · 2,900원)' 표시 확인
    const monthlyBtn = screen.getByRole('button', { name: premiumPlansFixture[0].buttonLabel });
    fireEvent.click(monthlyBtn);
    expect(onSelectPlan).toHaveBeenCalledWith({ planCode: 'PREMIUM_MONTHLY_30D' });

    const statusCard = document.querySelector('.premium-sandbox__status-card');
    expect(within(statusCard).getByText('선택한 테스트 플랜')).toBeInTheDocument();
    expect(within(statusCard).getByText(/30일 라이딩 가이드 테스트 플랜 \(30일 · 2,900원\)/)).toBeInTheDocument();

    // 2) 부모(MainPage)가 결제 완료 후 accessState를 "ACTIVE"로 전환하며 결제한 30일권 user 객체 전달
    rerender(
      <PremiumSandboxPage
        authState="authenticated"
        accessState="ACTIVE"
        user={{
          name: '라이더',
          subscription: {
            planId: 'PREMIUM_MONTHLY_30D',
            endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        }}
        onSelectPlan={onSelectPlan}
      />
    );

    // 3) '선택한 이용권' 문구는 완전히 소멸되고, '⭐ 따릉이 30일 정기권' 보유 상품명이 명시되며, 30일 카드에만 current가 부착됨을 검증!
    expect(within(statusCard).queryByText('선택한 테스트 플랜')).not.toBeInTheDocument();
    expect(within(statusCard).getByText(/30일 라이딩 가이드 테스트 플랜/)).toBeInTheDocument();
    expect(within(statusCard).getByText('가이드 접근 활성')).toBeInTheDocument();

    const monthlyCard = screen.getByTestId('plan-card-PREMIUM_MONTHLY_30D');
    const yearlyCard = screen.getByTestId('plan-card-PREMIUM_YEARLY_365D');
    expect(monthlyCard).toHaveClass('current');
    expect(yearlyCard).not.toHaveClass('current');
  });

  // 7. [안전 검증]: confirmPayment 성공 후 fetchSubscription 일시 실패 시에도 ACTIVE 유지 및 양방향 재시도 피드백 검증
  test('fetchSubscription 실패 시 ACTIVE 권한 유지 후 상태 새로고침 클릭 시 실패와 성공 상황에 맞춰 피드백이 정확히 제공된다', async () => {
    window.history.replaceState({}, '', '/?payment=processing&paymentKey=test-key-123&orderId=order-abc&amount=2900#premium');

    subscriptionApi.confirmPayment.mockResolvedValueOnce({ status: 'ACTIVE' });
    subscriptionApi.fetchSubscription.mockRejectedValueOnce(new Error('NETWORK_TIMEOUT'));

    render(<PremiumSandboxPage authState="authenticated" />);

    await waitFor(() => {
      expect(screen.getAllByText('가이드 접근 활성')).toHaveLength(3);
      expect(screen.getByText(/Sandbox 결제는 정상 승인되었습니다/)).toBeInTheDocument();
    });

    const refreshBtn = screen.getByRole('button', { name: '상태 새로고침' });
    expect(refreshBtn).toBeInTheDocument();

    subscriptionApi.fetchSubscription.mockRejectedValueOnce(new Error('STILL_DOWN'));
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/상세 정보를 불러오지 못했습니다/)).toBeInTheDocument();
    });

    subscriptionApi.fetchSubscription.mockResolvedValueOnce({
      status: 'ACTIVE',
      planId: 'PREMIUM_MONTHLY_30D',
      endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const retryBtn = screen.getByRole('button', { name: '다시 시도' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Sandbox 가이드 접근 상태가 성공적으로 동기화되었습니다/)).toBeInTheDocument();
    });
  });

  // 8. 토스 결제 승인 실패 시: fetchSubscription을 호출하지 않고 에러 배너를 표시한다
  test('confirmPayment가 실패한 경우 fetchSubscription을 호출하지 않고 오류 배너를 띄운다', async () => {
    window.history.replaceState({}, '', '/?payment=processing&paymentKey=bad-key&orderId=order-bad&amount=2900#premium');

    subscriptionApi.confirmPayment.mockRejectedValueOnce(new Error('PAYMENT_VERIFICATION_FAILED'));

    render(<PremiumSandboxPage authState="authenticated" />);

    await waitFor(() => {
      expect(subscriptionApi.confirmPayment).toHaveBeenCalled();
      expect(subscriptionApi.fetchSubscription).not.toHaveBeenCalled();
      expect(screen.getByText(/결제 승인 처리 중 오류가 발생했습니다/)).toBeInTheDocument();
    });
  });

  // 9. 단독 페이지 모드에서 결제 시작: startCheckout 및 requestTossCheckout 호출 검증
  test('onSelectPlan이 없는 단독 페이지에서 결제 클릭 시 startCheckout 및 requestTossCheckout이 순차 실행된다', async () => {
    subscriptionApi.startCheckout.mockResolvedValueOnce({
      orderId: 'order-new',
      amount: 2900,
      customerKey: 'cust-1',
    });
    tossCheckout.requestTossCheckout.mockResolvedValueOnce({});

    render(<PremiumSandboxPage authState="authenticated" accessState="FREE" />);

    const monthlyBtn = screen.getByRole('button', { name: premiumPlansFixture[0].buttonLabel });
    fireEvent.click(monthlyBtn);

    await waitFor(() => {
      expect(subscriptionApi.startCheckout).toHaveBeenCalledWith('PREMIUM_MONTHLY_30D');
      expect(tossCheckout.requestTossCheckout).toHaveBeenCalledWith(
        { orderId: 'order-new', amount: 2900, customerKey: 'cust-1' },
        expect.objectContaining({ onCancel: expect.any(Function) })
      );
    });
  });

  // 10. EXPIRED 상태: 이용 기간 만료 안내 배너 노출 검증
  test('EXPIRED 상태에서는 sandbox 가이드 접근 기간 만료 안내 배너가 표시된다', () => {
    render(<PremiumSandboxPage authState="authenticated" accessState="EXPIRED" />);
    expect(screen.getByText(/Sandbox 가이드 접근 기간이 만료되었습니다/)).toBeInTheDocument();
  });
});

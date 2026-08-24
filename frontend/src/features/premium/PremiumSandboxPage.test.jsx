import { render, screen, fireEvent } from '@testing-library/react';
import PremiumSandboxPage from './PremiumSandboxPage';

// 1. 모든 상태에서 SANDBOX TEST 배지 노출 검증
test('renders SANDBOX TEST banner on all 6 statuses', () => {
    const { rerender } = render(<PremiumSandboxPage status="PREPARING" />);
    expect(screen.getByText(/SANDBOX TEST · 실제 결제 없음/i)).toBeInTheDocument();

    rerender(<PremiumSandboxPage status="PROCESSING" />);
    expect(screen.getByText(/SANDBOX TEST · 실제 결제 없음/i)).toBeInTheDocument();

    rerender(<PremiumSandboxPage status="SUCCESS" />);
    expect(screen.getByText(/SANDBOX TEST · 실제 결제 없음/i)).toBeInTheDocument();

    rerender(<PremiumSandboxPage status="CANCELLED" />);
    expect(screen.getByText(/SANDBOX TEST · 실제 결제 없음/i)).toBeInTheDocument();

    rerender(<PremiumSandboxPage status="FAILED" />);
    expect(screen.getByText(/SANDBOX TEST · 실제 결제 없음/i)).toBeInTheDocument();

    rerender(<PremiumSandboxPage status="PAYMENT_NOT_ENABLED" />);
    expect(screen.getByText(/SANDBOX TEST · 실제 결제 없음/i)).toBeInTheDocument();
});

// 2. 여섯 상태 렌더링 및 문구/구독정보/우측 카드 검증
test('renders all 6 payment statuses correctly', () => {
    const { rerender } = render(<PremiumSandboxPage status="PREPARING" />);
    expect(screen.getByText('테스트 상품')).toBeInTheDocument();
    expect(screen.getByText('현재 상태')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sandbox checkout 시작' })).toBeInTheDocument();
    expect(screen.getByText('결제 준비')).toBeInTheDocument();

    rerender(<PremiumSandboxPage status="PROCESSING" />);
    expect(screen.getByRole('button', { name: '처리 중...' })).toBeDisabled();
    expect(screen.getByText('처리 중')).toBeInTheDocument();

    const fixtureSub = { plan: '프리미엄 30일 sandbox 체험', status: 'ACTIVE' };
    rerender(<PremiumSandboxPage status="SUCCESS" subscription={fixtureSub} />);
    expect(screen.getByRole('button', { name: '구독 상태 새로고침' })).toBeInTheDocument();
    expect(screen.getByText('sandbox 완료')).toBeInTheDocument();
    expect(screen.getByText(/ACTIVE/i)).toBeInTheDocument();

    rerender(<PremiumSandboxPage status="CANCELLED" />);
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(screen.getByText('사용자 취소')).toBeInTheDocument();

    rerender(<PremiumSandboxPage status="FAILED" />);
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(screen.getByText('테스트 실패')).toBeInTheDocument();

    rerender(<PremiumSandboxPage status="PAYMENT_NOT_ENABLED" />);
    expect(screen.getByRole('button', { name: '결제 사용 불가' })).toBeDisabled();
    expect(screen.getByText('운영 결제 비활성')).toBeInTheDocument();
});

// 3. 네 가지 콜백 (onCheckout, onCallbackResult, onRefreshSubscription, onRetry) 호출 및 카운트 검증
test('calls onCheckout, onCallbackResult, onRefreshSubscription, and onRetry callbacks correctly', () => {
    const onCheckout = jest.fn();
    const onCallbackResult = jest.fn();
    const onRefreshSubscription = jest.fn();
    const onRetry = jest.fn();

    const { rerender } = render(
        <PremiumSandboxPage
            status="PREPARING"
            onCheckout={onCheckout}
            onCallbackResult={onCallbackResult}
        />
    );
    fireEvent.click(screen.getByRole('button', { name: 'sandbox checkout 시작' }));
    expect(onCheckout).toHaveBeenCalledTimes(1);

    // SUCCESS 결과 상태 진입 시 onCallbackResult 1회 자동 호출 검증
    rerender(
        <PremiumSandboxPage
            status="SUCCESS"
            onRefreshSubscription={onRefreshSubscription}
            onCallbackResult={onCallbackResult}
        />
    );
    expect(onCallbackResult).toHaveBeenCalledTimes(1);
    expect(onCallbackResult).toHaveBeenCalledWith('SUCCESS');

    fireEvent.click(screen.getByRole('button', { name: '구독 상태 새로고침' }));
    expect(onRefreshSubscription).toHaveBeenCalledTimes(1);

    // CANCELLED 결과 상태 진입 시 onCallbackResult 추가 1회 호출 검증
    rerender(
        <PremiumSandboxPage
            status="CANCELLED"
            onRetry={onRetry}
            onCallbackResult={onCallbackResult}
        />
    );
    expect(onCallbackResult).toHaveBeenCalledTimes(2);
    expect(onCallbackResult).toHaveBeenCalledWith('CANCELLED');

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    // FAILED 결과 상태 진입 시 onCallbackResult 추가 1회 호출 및 onRetry 검증
    rerender(
        <PremiumSandboxPage
            status="FAILED"
            onRetry={onRetry}
            onCallbackResult={onCallbackResult}
        />
    );
    expect(onCallbackResult).toHaveBeenCalledTimes(3);
    expect(onCallbackResult).toHaveBeenCalledWith('FAILED');

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(2);
});

// 4. PROCESSING 중 중복 클릭 방지 검증
test('prevents duplicate clicks during PROCESSING status', () => {
    const onCheckout = jest.fn();
    render(
        <PremiumSandboxPage status="PROCESSING" onCheckout={onCheckout} />
    );

    const processingBtn = screen.getByRole('button', { name: '처리 중...' });
    expect(processingBtn).toBeDisabled();
    fireEvent.click(processingBtn);
    expect(onCheckout).not.toHaveBeenCalled();
});

// 5. 결제 정보 입력창 및 외부 PG SDK / URL 링크가 렌더링되지 않는지 검사한다.
test('결제정보 입력 필드 및 외부 PG SDK / URL 링크가 렌더링되지 않는지 검사한다.', () => {
    render(<PremiumSandboxPage status="PREPARING" />);

    // 카드, CVC, 계좌 입력창 미존재 단정
    expect(screen.queryByPlaceholderText(/카드/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/CVC/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/계좌/i)).not.toBeInTheDocument();

    // 외부 링크(href) 및 외부 PG SDK 스크립트 미존재 단정
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('script[src*="toss"]')).not.toBeInTheDocument();
});

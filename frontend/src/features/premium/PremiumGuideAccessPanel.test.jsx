// PremiumGuideAccessPanel.test.jsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PremiumGuideAccessPanel from './PremiumGuideAccessPanel';
import { premiumPlansFixture, accessStatesFixture } from './data/premiumGuideAccessFixture';
describe('PremiumGuideAccessPanel 컴포넌트 단위 테스트', () => {
  // 1. ANONYMOUS 상태: 잠금 문구 및 로그인 콜백 1회 호출 검증
  test('ANONYMOUS 상태에서는 잠금 안내를 보여주고 로그인 버튼 클릭 시 onLogin을 1회 호출한다', () => {
    const onLogin = jest.fn();
    render(<PremiumGuideAccessPanel accessState="ANONYMOUS" onLogin={onLogin} />);
    expect(screen.getByText(/로그인 후 상세 가이드를 볼 수 있습니다/)).toBeInTheDocument();
    expect(screen.queryByText('프리미엄 월간')).not.toBeInTheDocument();
    const loginBtn = screen.getByRole('button', { name: '로그인하고 계속' });
    userEvent.click(loginBtn);
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
  // 2. FREE 상태: 요금제 2장 렌더링 및 onSelectPlan 정확한 인자({ planCode }) 검증
  test('FREE 상태에서 각 요금제 카드 내부에 해당 플랜의 이름, 가격, 정책문구, 버튼이 정확히 렌더링되고 클릭된다', () => {
    const onSelectPlan = jest.fn();
    render(<PremiumGuideAccessPanel accessState="FREE" onSelectPlan={onSelectPlan} />);
    // 화면에 렌더링된 요금제 카드 article들(2개)을 가져옴
    const planCards = screen.getAllByRole('article');
    expect(planCards).toHaveLength(premiumPlansFixture.length);
    // 각 카드 영역(within) 안에서만 해당 plan의 데이터가 존재하는지 정밀 검증
    premiumPlansFixture.forEach((plan, index) => {
      const card = planCards[index];
      const cardScope = within(card); // 👈 해당 카드 영역으로 범위 한정!
      expect(cardScope.getByRole('heading', { level: 2, name: plan.name })).toBeInTheDocument();
      expect(cardScope.getByText(plan.priceDuration)).toBeInTheDocument();
      expect(cardScope.getByText(plan.policyText)).toBeInTheDocument();
      const planBtn = cardScope.getByRole('button', { name: plan.buttonLabel });
      userEvent.click(planBtn);
      expect(onSelectPlan).toHaveBeenNthCalledWith(index + 1, { planCode: plan.planCode });
    });
    expect(onSelectPlan).toHaveBeenCalledTimes(premiumPlansFixture.length);
  });
  // 3. EXPIRED 상태: 이용 기간 종료 문구와 요금제 2장 렌더링 검증
  test('EXPIRED 상태에서는 이용 기간 종료 안내 문구와 요금제 카드를 함께 렌더링한다', () => {
    const onSelectPlan = jest.fn();
    render(<PremiumGuideAccessPanel accessState="EXPIRED" onSelectPlan={onSelectPlan} />);
    expect(screen.getByText(/이용 기간이 종료되었습니다/)).toBeInTheDocument();
    expect(screen.getByText('프리미엄 월간')).toBeInTheDocument();
    expect(screen.getByText('프리미엄 연간')).toBeInTheDocument();
    const monthlyBtn = screen.getByRole('button', { name: '월간 선택' });
    userEvent.click(monthlyBtn);
    expect(onSelectPlan).toHaveBeenCalledTimes(1);
    expect(onSelectPlan).toHaveBeenCalledWith({ planCode: 'PREMIUM_MONTHLY_30D' });
  });
  // 4. PROCESSING 상태: 결제 확인 중 안내 및 두 버튼 비활성화(disabled) 검증
  test('PROCESSING 상태에서는 결제 확인 중 문구가 뜨고 버튼이 disabled되며 콜백이 호출되지 않는다', () => {
    const onSelectPlan = jest.fn();
    render(<PremiumGuideAccessPanel accessState="PROCESSING" onSelectPlan={onSelectPlan} />);
    expect(screen.getByText('결제 확인 중입니다.')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
      userEvent.click(btn);
    });
    expect(onSelectPlan).not.toHaveBeenCalled();
  });
  // 5. 공통 필수 안전 배지 상시 노출 검증 (각 상태당 1회 렌더링)
  test.each(accessStatesFixture)('%s 상태에서 SANDBOX TEST 필수 안전 배지가 상시 노출된다', (state) => {
    render(<PremiumGuideAccessPanel accessState={state} />);
    expect(screen.getByText(/SANDBOX TEST · 실제 결제·환불·정산은 제공하지 않습니다/)).toBeInTheDocument();
  });
});
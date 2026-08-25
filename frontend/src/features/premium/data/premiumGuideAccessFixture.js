// data/premiumGuideAccessFixture.js
// 4가지 접근 상태 상수
export const accessStatesFixture = ['ANONYMOUS', 'FREE', 'EXPIRED', 'PROCESSING'];
// 2가지 프리미엄 요금제 규격 데이터
export const premiumPlansFixture = [
  {
    planCode: 'PREMIUM_MONTHLY_30D',
    name: '프리미엄 월간',
    priceDuration: '30일 · 2,900원',
    policyText: '자동 갱신 없음',
    buttonLabel: '월간 선택',
  },
  {
    planCode: 'PREMIUM_YEARLY_365D',
    name: '프리미엄 연간',
    priceDuration: '365일 · 29,000원',
    policyText: '자동 갱신 없음',
    buttonLabel: '연간 선택',
  },
];

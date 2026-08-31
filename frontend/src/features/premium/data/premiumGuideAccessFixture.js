// data/premiumGuideAccessFixture.js
// 4가지 접근 상태 상수
export const accessStatesFixture = ['ANONYMOUS', 'FREE', 'EXPIRED', 'PROCESSING', 'ACTIVE'];

// Toss sandbox에서 라이딩 가이드 접근 상태를 확인하는 테스트 플랜 데이터
export const premiumPlansFixture = [
  {
    planCode: 'PREMIUM_MONTHLY_30D',
    name: '30일 라이딩 가이드 테스트 플랜',
    duration: '30일',
    price: '2,900원',
    priceDuration: '30일 · 2,900원',
    policyText: '자동 갱신 없음',
    isFeatured: false,
    buttonLabel: '30일 테스트 플랜 결제하기 (2,900원)',
    features: [
      '라이딩 가이드 접근 상태를 확인하는 sandbox 테스트',
      '실제 따릉이 이용권 구매 또는 이용 자격을 부여하지 않음',
      '따라가요 라이딩 가이드 화면의 접근 흐름 확인',
      '30일 후 자동 결제 없음',
    ],
  },
  {
    planCode: 'PREMIUM_YEARLY_365D',
    name: '365일 라이딩 가이드 테스트 플랜',
    duration: '365일',
    price: '29,000원',
    priceDuration: '365일 · 29,000원',
    policyText: '가장 경제적인 선택 · 자동 갱신 없음',
    isFeatured: true,
    buttonLabel: '365일 테스트 플랜 결제하기 (29,000원)',
    features: [
      '장기 라이딩 가이드 접근 상태를 확인하는 sandbox 테스트',
      '실제 따릉이 이용권 구매 또는 이용 자격을 부여하지 않음',
      'Toss checkout·callback·구독 상태 전이 검증',
      '365일 후 자동 결제 없음',
    ],
  },
];

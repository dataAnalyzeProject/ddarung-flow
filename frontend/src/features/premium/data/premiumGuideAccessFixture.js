// data/premiumGuideAccessFixture.js
// 4가지 접근 상태 상수
export const accessStatesFixture = ['ANONYMOUS', 'FREE', 'EXPIRED', 'PROCESSING', 'ACTIVE'];

// 2가지 서울자전거 따릉이 공식 정기 이용권 규격 데이터
export const premiumPlansFixture = [
  {
    planCode: 'PREMIUM_MONTHLY_30D',
    name: '따릉이 30일 정기권',
    duration: '30일',
    price: '2,900원',
    priceDuration: '30일 · 2,900원',
    policyText: '자동 갱신 없음',
    isFeatured: false,
    buttonLabel: '30일 이용권 결제하기 (2,900원)',
    features: [
      '서울시 전역 2,700+ 대여소 따릉이 자유 이용',
      '1회 1시간 이용 후 반납 시 무제한 재대여',
      '따릉이 플로우 실시간 대여소 예측과 바로 연계',
      '30일 만료 후 추가 자동 결제 없음',
    ],
  },
  {
    planCode: 'PREMIUM_YEARLY_365D',
    name: '따릉이 365일 정기권',
    duration: '365일',
    price: '29,000원',
    priceDuration: '365일 · 29,000원',
    policyText: '가장 경제적인 선택 · 자동 갱신 없음',
    isFeatured: true,
    buttonLabel: '365일 이용권 결제하기 (29,000원)',
    features: [
      '1년(365일) 내내 서울시 전역 따릉이 무제한 이용',
      '1회 1시간 이용 후 반납 시 365일 내내 무제한 재대여',
      '출퇴근 및 일상 라이딩을 위한 가장 경제적인 선택',
      '365일 만료 후 추가 자동 결제 없음',
    ],
  },
];

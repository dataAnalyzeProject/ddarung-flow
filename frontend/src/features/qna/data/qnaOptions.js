export const categoryOptions = [
  ["ALL", "전체 분류"],
  ["SERVICE", "서비스 이용"],
  ["PREDICTION", "예측 결과"],
  ["ACCOUNT", "계정"],
];

export const categoryLabelFor = (category) => categoryOptions.find(([value]) => value === category)?.[1] || "서비스 이용";


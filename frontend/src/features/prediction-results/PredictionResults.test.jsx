import { fireEvent, render, screen } from "@testing-library/react";
import PredictionResults from "./PredictionResults";
import { emptyResult, lowWithAlternativesResult, normalResult } from "./data/predictionResultMock";

const sortingResult = {
  ...normalResult,
  selectedStationId: "ST-1",
  candidates: [
    {
      ...normalResult.candidates[0],
      selectedProbability: 0.7,
      durationSeconds: 900,
      distanceMeters: 300,
      currentInventory: {
        ...normalResult.candidates[0].currentInventory,
        collectedAt: "2026-08-04T15:02:10+09:00",
      },
    },
    {
      ...normalResult.candidates[1],
      selectedProbability: 0.9,
      durationSeconds: 1200,
      distanceMeters: 200,
      currentInventory: {
        ...normalResult.candidates[1].currentInventory,
        collectedAt: "2026-08-04T14:58:10+09:00",
        inventoryStatus: "DELAYED",
      },
    },
    {
      ...normalResult.candidates[2],
      selectedProbability: 0.8,
      durationSeconds: 600,
      distanceMeters: 400,
      currentInventory: {
        ...normalResult.candidates[2].currentInventory,
        collectedAt: "2026-08-04T15:01:10+09:00",
      },
    },
  ],
};

test("정상 결과에서 승인된 후보별 결과를 그대로 표시한다", () => {
  render(<PredictionResults result={normalResult} />);
  expect(screen.getByRole("heading", { name: "목적지 주변 예측 결과" })).toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getByText("성수역 3번 출구")).toBeInTheDocument();
  expect(screen.getByText("성수동 카페거리")).toBeInTheDocument();
  expect(screen.getByText("서울숲 남문")).toBeInTheDocument();
  expect(screen.getByText("오후 3:41")).toBeInTheDocument();
  expect(screen.getByText("오후 3:45")).toBeInTheDocument();
  expect(screen.getByText("오후 3:51")).toBeInTheDocument();
  expect(screen.getAllByText("오후 4:00", { exact: false })).toHaveLength(3);
  expect(screen.getByText("87%")).toBeInTheDocument();
  expect(screen.getByText("62%")).toBeInTheDocument();
  expect(screen.getByText("31%")).toBeInTheDocument();
  expect(screen.getByText("8")).toBeInTheDocument();
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
  expect(screen.getByText("높음")).toBeInTheDocument();
  expect(screen.getByText("중간")).toBeInTheDocument();
  expect(screen.getByText("낮음")).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "필요 수량" })).not.toBeInTheDocument();
});

test("결과가 없으면 안내와 입력 수정 버튼을 표시한다", () => {
  const onEditInput = jest.fn();
  render(<PredictionResults result={emptyResult} onEditInput={onEditInput} />);
  expect(screen.getByText("조건에 맞는 예측 결과가 없습니다.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "입력 수정" }));
  expect(onEditInput).toHaveBeenCalledTimes(1);
});

test("대여소를 선택하면 선택 콜백에 stationId를 전달한다", () => {
  const onSelectStation = jest.fn();
  render(<PredictionResults result={normalResult} onSelectStation={onSelectStation} />);
  fireEvent.click(screen.getByRole("button", { name: /ST-2 62% 성수동 카페거리/ }));
  expect(onSelectStation).toHaveBeenCalledWith("ST-2");
});

test("상세정보를 펼치면 누적확률과 데이터 기준시각을 표시한다", () => {
  render(<PredictionResults result={normalResult} />);
  fireEvent.click(screen.getAllByRole("button", { name: "상세정보 펼치기 ↓" })[0]);
  const details = screen.getByLabelText("성수역 3번 출구 상세정보");
  expect(details).toHaveTextContent("1대 이상");
  expect(details).toHaveTextContent("현재 재고 기준");
  expect(details).toHaveTextContent("모델 입력 기준");
  expect(details).toHaveTextContent("availability-v1");
});

test("낮음 후보가 선택되면 대체 후보를 표시한다", () => {
  render(<PredictionResults result={lowWithAlternativesResult} />);
  expect(screen.getByRole("heading", { name: "대체 대여소를 확인하세요." })).toBeInTheDocument();
  expect(screen.getAllByText("대체 후보")).toHaveLength(2);
});

test("FE-3.2 기본 정렬은 가능성·도착시간·거리·stationId 순이다", () => {
  render(<PredictionResults result={sortingResult} />);
  const names = screen.getAllByRole("article").map((article) => article.querySelector("h3").textContent);
  expect(names).toEqual(["성수동 카페거리", "서울숲 남문", "성수역 3번 출구"]);
});

test("FE-3.2 도착 시간 빠른 순으로 전환한다", () => {
  render(<PredictionResults result={sortingResult} />);
  fireEvent.change(screen.getByRole("combobox", { name: "정렬 기준" }), {
    target: { value: "arrival" },
  });
  const names = screen.getAllByRole("article").map((article) => article.querySelector("h3").textContent);
  expect(names).toEqual(["서울숲 남문", "성수역 3번 출구", "성수동 카페거리"]);
});

test("FE-3.2 정렬해도 선택 대여소를 유지한다", () => {
  render(<PredictionResults result={sortingResult} />);
  expect(screen.getByRole("button", { name: /ST-1 70% 성수역 3번 출구/ })).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByRole("combobox", { name: "정렬 기준" }), {
    target: { value: "arrival" },
  });
  expect(screen.getByRole("button", { name: /ST-1 70% 성수역 3번 출구/ })).toHaveAttribute("aria-pressed", "true");
});

test("FE-3.2 전체 기준시각은 가장 이른 collectedAt이다", () => {
  render(<PredictionResults result={sortingResult} />);
  expect(screen.getByText("전체 현재 재고 기준")).toBeInTheDocument();
  expect(screen.getByText("오후 2:58")).toBeInTheDocument();
});

test("FE-3.2 서버가 준 지연 상태를 표시한다", () => {
  render(<PredictionResults result={sortingResult} />);
  expect(screen.getByText("일부 지연")).toBeInTheDocument();
});

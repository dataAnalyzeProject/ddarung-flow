import { fireEvent, render, screen } from "@testing-library/react";
import RidingGuidePage from "./RidingGuidePage";

describe("라이딩 가이드 화면", () => {
  test("선택한 대여소명과 고정 안내 데이터를 표시한다", () => {
    render(<RidingGuidePage stationName="서울숲 남문" onBack={jest.fn()} />);

    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "서울숲 남문 라이딩 가이드" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "시간대별 라이딩 환경" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "도착지 날씨" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "도착지 대기질" })).toBeInTheDocument();
    expect(screen.getByText("기상청 · 에어코리아 · 따릉이 예측 데이터")).toBeInTheDocument();
    expect(screen.getByLabelText("데이터 상태")).toBeInTheDocument();
  });

  test("상단 뒤로가기와 경로 다시 보기는 같은 복귀 콜백을 호출한다", () => {
    const onBack = jest.fn();
    render(<RidingGuidePage stationName="성수역 3번 출구" onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "대여 예측으로 돌아가기" }));
    fireEvent.click(screen.getByRole("button", { name: "경로 다시 보기" }));

    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import PlaceStationSearchPage from "./PlaceStationSearchPage";
import {
  placeResultsMock,
  stationResultsMock,
} from "./data/placeStationSearchMock";

test.skip("FE-4.2 경로 방식 선택값을 승인된 형태로 전달한다", () => {
  const onSearch = jest.fn();
  const onContinue = jest.fn();
  render(
    <PlaceStationSearchPage
      searchStatus="success"
      placeResults={placeResultsMock}
      stationResults={stationResultsMock}
      onSearch={onSearch}
      onContinue={onContinue}
    />
  );

  fireEvent.change(screen.getByRole("textbox", { name: "출발지 검색어" }), {
    target: { value: " 서울역 " },
  });
  fireEvent.click(screen.getByRole("button", { name: "출발지 검색" }));
  expect(onSearch).toHaveBeenCalledWith({ mode: "ROUTE", field: "origin", query: "서울역" });
  fireEvent.click(screen.getByRole("button", { name: "출발지로 서울역 선택" }));

  fireEvent.change(screen.getByRole("textbox", { name: "목적지 검색어" }), {
    target: { value: "서울시청" },
  });
  fireEvent.click(screen.getByRole("button", { name: "목적지 검색" }));
  fireEvent.click(screen.getByRole("button", { name: "목적지로 서울특별시청 선택" }));
  fireEvent.change(screen.getByRole("combobox", { name: "이동수단" }), {
    target: { value: "WALK" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "필요 자전거 수" }), {
    target: { value: "2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "계속하기" }));

  expect(onContinue).toHaveBeenCalledWith({
    mode: "ROUTE",
    origin: {
      placeId: "place-seoul-station",
      name: "서울역",
      latitude: 37.5547,
      longitude: 126.9707,
    },
    destination: {
      placeId: "place-city-hall",
      name: "서울특별시청",
      latitude: 37.5663,
      longitude: 126.9784,
    },
    travelMode: "WALK",
    directMinutes: null,
    requiredBikeCount: 2,
  });
});

test.skip("FE-4.2 직접 시간 방식 선택값을 승인된 형태로 전달한다", () => {
  const onContinue = jest.fn();
  render(
    <PlaceStationSearchPage
      searchStatus="success"
      placeResults={placeResultsMock}
      stationResults={stationResultsMock}
      onContinue={onContinue}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "직접 시간 입력" }));
  fireEvent.change(screen.getByRole("textbox", { name: "대여소 검색어" }), {
    target: { value: "망원역" },
  });
  fireEvent.click(screen.getByRole("button", { name: "대여소 검색" }));
  fireEvent.click(screen.getByRole("button", { name: "102. 망원역 1번출구 앞 선택" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "도착 예정 분" }), {
    target: { value: "95" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "필요 자전거 수" }), {
    target: { value: "2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "계속하기" }));

  expect(onContinue).toHaveBeenCalledWith({
    mode: "DIRECT",
    station: {
      stationId: "ST-4",
      name: "102. 망원역 1번출구 앞",
      latitude: 37.5556488,
      longitude: 126.91062927,
    },
    travelMode: "DIRECT",
    directMinutes: 95,
    requiredBikeCount: 2,
  });
});

test.skip("FE-4.2 두 글자 미만 검색어는 검색하지 않는다", () => {
  const onSearch = jest.fn();
  render(<PlaceStationSearchPage onSearch={onSearch} />);

  fireEvent.change(screen.getByRole("textbox", { name: "출발지 검색어" }), {
    target: { value: "서" },
  });
  fireEvent.click(screen.getByRole("button", { name: "출발지 검색" }));

  expect(screen.getByText("검색어는 두 글자 이상 입력해 주세요.")).toBeInTheDocument();
  expect(onSearch).not.toHaveBeenCalled();
});

test.skip("FE-4.2 결과 없음과 오류 상태를 구분한다", () => {
  const { rerender } = render(<PlaceStationSearchPage searchStatus="empty" />);
  expect(screen.getByText("검색 결과가 없습니다. 다른 검색어를 입력해 주세요.")).toBeInTheDocument();

  rerender(<PlaceStationSearchPage searchStatus="error" />);
  expect(screen.getByText("검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
});

test.skip("FE-4.2 필수 선택 전에는 계속하기를 누를 수 없다", () => {
  render(<PlaceStationSearchPage />);
  expect(screen.getByRole("button", { name: "계속하기" })).toBeDisabled();
});

import { fireEvent, render, screen } from "@testing-library/react";
import PlaceStationSearchPage from "./PlaceStationSearchPage";
import {
  placeResultsMock,
  stationResultsMock,
} from "./data/placeStationSearchMock";
import userEvent from "@testing-library/user-event";

test("FE-3.3 경로 방식 선택값을 승인된 형태로 전달한다", () => {
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

test("FE-3.3 직접 시간 방식 선택값을 승인된 형태로 전달한다", () => {
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

test("FE-3.3 두 글자 미만 검색어는 검색하지 않는다", () => {
  const onSearch = jest.fn();
  render(<PlaceStationSearchPage onSearch={onSearch} />);

  fireEvent.change(screen.getByRole("textbox", { name: "출발지 검색어" }), {
    target: { value: "서" },
  });
  fireEvent.click(screen.getByRole("button", { name: "출발지 검색" }));

  expect(screen.getByText("검색어는 두 글자 이상 입력해 주세요.")).toBeInTheDocument();
  expect(onSearch).not.toHaveBeenCalled();
});

test("FE-3.3 결과 없음과 오류 상태를 구분한다", () => {
  const { rerender } = render(<PlaceStationSearchPage searchStatus="empty" />);
  expect(screen.getByText("검색 결과가 없습니다. 다른 검색어를 입력해 주세요.")).toBeInTheDocument();

  rerender(<PlaceStationSearchPage searchStatus="error" />);
  expect(screen.getByText("검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
});

test("FE-3.3 필수 선택 전에는 계속하기를 누를 수 없다", () => {
  render(<PlaceStationSearchPage />);
  expect(screen.getByRole("button", { name: "계속하기" })).toBeDisabled();
});

test("FE-3.3 키보드만 사용해 탭, 검색 결과, 조건 선택과 계속하기를 진행한다", () => {
  const onSearch = jest.fn();
  const onContinue = jest.fn();
  render(
    <PlaceStationSearchPage
      searchStatus="success"
      placeResults={placeResultsMock}
      onSearch={onSearch}
      onContinue={onContinue}
    />
  );
  // 1. 출발지 입력 및 검색 버튼 실행
  userEvent.tab(); // '경로로 찾기' 탭
  userEvent.tab(); // '직접 시간 입력' 탭
  userEvent.tab(); // '출발지 검색어' 입력창
  expect(screen.getByRole("textbox", { name: "출발지 검색어" })).toHaveFocus();
  userEvent.type(screen.getByRole("textbox", { name: "출발지 검색어" }), "서울역");
  userEvent.tab(); // '출발지 검색' 버튼
  expect(screen.getByRole("button", { name: "출발지 검색" })).toHaveFocus();
  userEvent.keyboard("{Enter}");
  expect(onSearch).toHaveBeenCalledWith({ mode: "ROUTE", field: "origin", query: "서울역" });
  // 2. 출발지 장소 선택
  userEvent.tab(); // '출발지로 서울역 선택' 버튼
  expect(screen.getByRole("button", { name: "출발지로 서울역 선택" })).toHaveFocus();
  userEvent.keyboard("{Enter}");
  // 3. 목적지 입력 및 검색 버튼 실행
  userEvent.tab(); // '목적지 검색어' 입력창
  expect(screen.getByRole("textbox", { name: "목적지 검색어" })).toHaveFocus();
  userEvent.type(screen.getByRole("textbox", { name: "목적지 검색어" }), "서울시청");
  userEvent.tab(); // '목적지 검색' 버튼
  expect(screen.getByRole("button", { name: "목적지 검색" })).toHaveFocus();
  userEvent.keyboard("{Enter}");
  // 4. 목적지 장소 선택
  userEvent.tab(); // '목적지로 서울특별시청 선택' 버튼
  expect(screen.getByRole("button", { name: "목적지로 서울특별시청 선택" })).toHaveFocus();
  userEvent.keyboard("{Enter}");
  // 5. 이동수단 및 필요 자전거 수 선택 (순수 키보드 조작)
  userEvent.tab(); // '이동수단' select
  expect(screen.getByRole("combobox", { name: "이동수단" })).toHaveFocus();
  userEvent.keyboard("{ArrowDown}"); // ⌨️ 방향키로 선택
  userEvent.tab(); // '필요 자전거 수' select
  expect(screen.getByRole("combobox", { name: "필요 자전거 수" })).toHaveFocus();
  userEvent.keyboard("{ArrowDown}"); // ⌨️ 방향키로 2대 선택
  // 6. 계속하기 버튼 실행
  userEvent.tab(); // '계속하기' 버튼
  expect(screen.getByRole("button", { name: "계속하기" })).toHaveFocus();
  userEvent.keyboard("{Enter}");
  // 7. 최종 제출 payload 및 1회 호출 검증!
  expect(onContinue).toHaveBeenCalledTimes(1);
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
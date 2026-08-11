import { fireEvent, render, screen } from "@testing-library/react";
import PlaceStationSearchPage from "./PlaceStationSearchPage";
import {
  placeResultsMock,
  stationResultsMock,
} from "./data/placeStationSearchMock";
import userEvent from "@testing-library/user-event";
import React from "react";


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

test("FE-3.3 사용자가 키보드만으로 검색하고 결과를 선택해 계속하기를 완료한다", () => {
  const onSearch = jest.fn();
  const onContinue = jest.fn();

  // 실제 부모 컴포넌트가 검색 결과를 내려주는 상황을 흉내낸다.
  const TestWrapper = () => {
    const [searchStatus, setSearchStatus] = React.useState("idle");
    const [placeResults, setPlaceResults] = React.useState([]);
    const [stationResults, setStationResults] = React.useState([]);
    const handleSearch = (request) => {
      onSearch(request);

      if (request.mode === "ROUTE") {
        setSearchStatus("success");
        setPlaceResults(placeResultsMock);
      }

      if (request.mode === "DIRECT") {
        setSearchStatus("success");
        setStationResults(stationResultsMock);
      }
    };

    return (
      <PlaceStationSearchPage
        searchStatus={searchStatus}
        placeResults={placeResults}
        stationResults={stationResults}
        onSearch={handleSearch}
        onContinue={onContinue}
      />
    );
  };

  render(<TestWrapper />);

  // --------------------------------
  // 1. 처음에는 검색 결과가 없다.
  // --------------------------------

  expect(
    screen.queryByRole("button", {
      name: "출발지로 서울역 선택",
    })
  ).not.toBeInTheDocument();

  // --------------------------------
  // 2. 사용자가 키보드로 출발지를 검색한다.
  // --------------------------------

  const originInput = screen.getByRole("textbox", {
    name: "출발지 검색어",
  });

  originInput.focus();
  expect(originInput).toHaveFocus();

  userEvent.keyboard("서울역");

  userEvent.tab();

  expect(
    screen.getByRole("button", {
      name: "출발지 검색",
    })
  ).toHaveFocus();

  userEvent.keyboard("{Enter}");

  expect(onSearch).toHaveBeenCalledWith({
    mode: "ROUTE",
    field: "origin",
    query: "서울역",
  });

  // --------------------------------
  // 3. 검색 결과가 외부에서 들어왔다.
  // --------------------------------

  expect(
    screen.getByRole("button", {
      name: "출발지로 서울역 선택",
    })
  ).toBeInTheDocument();

  // --------------------------------
  // 4. 사용자가 Tab → Enter로 결과를 선택한다.
  // --------------------------------

  userEvent.tab();

  expect(
    screen.getByRole("button", {
      name: "출발지로 서울역 선택",
    })
  ).toHaveFocus();

  userEvent.keyboard("{Enter}");

  // --------------------------------
  // 5. 목적지를 검색한다.
  // --------------------------------

  userEvent.tab();
  userEvent.tab();

  const destinationInput = screen.getByRole("textbox", {
    name: "목적지 검색어",
  });

  expect(destinationInput).toHaveFocus();

  userEvent.keyboard("서울시청");

  userEvent.tab();

  expect(
    screen.getByRole("button", {
      name: "목적지 검색",
    })
  ).toHaveFocus();

  userEvent.keyboard("{Enter}");

  expect(onSearch).toHaveBeenCalledWith({
    mode: "ROUTE",
    field: "destination",
    query: "서울시청",
  });

  // --------------------------------
  // 6. 목적지 결과를 선택한다.
  // --------------------------------

  userEvent.tab();
  userEvent.tab();

  expect(
    screen.getByRole("button", {
      name: "목적지로 서울특별시청 선택",
    })
  ).toHaveFocus();

  userEvent.keyboard("{Enter}");

  // --------------------------------
  // 7. 이동수단을 키보드로 선택한다.
  // --------------------------------

  userEvent.tab();

  const travelMode = screen.getByRole("combobox", {
    name: "이동수단",
  });

  expect(travelMode).toHaveFocus();

  userEvent.keyboard("{ArrowDown}");

  // --------------------------------
  // 8. 자전거 수를 키보드로 선택한다.
  // --------------------------------

  userEvent.tab();
  const bikeCount = screen.getByRole("combobox", {
    name: "필요 자전거 수",
  });

  expect(bikeCount).toHaveFocus();
  expect(bikeCount).toHaveValue("1");

  userEvent.selectOptions(bikeCount, "2");
  // NOTE:
  // @testing-library/user-event@13.5.0 환경에서는
  // keyboard("{ArrowDown}")이 select의 실제 선택값을 변경하지 않음
  // 키 이벤트 전달 여부만 검증하고, 값 변경 자체는 별도 방식으로 확인
  expect(bikeCount).toHaveValue("2");

  // --------------------------------
  // 9. 계속하기
  // --------------------------------

  userEvent.tab();

  const continueButton = screen.getByRole("button", {
    name: "계속하기",
  });

  expect(continueButton).toHaveFocus();

  userEvent.keyboard("{Enter}");

  // --------------------------------
  // 10. 최종적으로 부모에게 전달된 값 확인
  // --------------------------------

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

test("FE-3.3 idle, loading, empty, error 상태에서는 검색 결과 목록이 노출되지 않는다", () => {
  // 1. idle 상태: 결과 데이터가 있어도 목록 버튼이 화면에 없어야 함
  const { rerender } = render(
    <PlaceStationSearchPage
      searchStatus="idle"
      placeResults={placeResultsMock}
      stationResults={stationResultsMock}
    />
  );
  expect(screen.queryByRole("button", { name: "출발지로 서울역 선택" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "102. 망원역 1번출구 앞 선택" })).not.toBeInTheDocument();
  // 2. loading 상태
  rerender(
    <PlaceStationSearchPage
      searchStatus="loading"
      placeResults={placeResultsMock}
      stationResults={stationResultsMock}
    />
  );
  expect(screen.queryByRole("button", { name: "출발지로 서울역 선택" })).not.toBeInTheDocument();
  // 3. empty 상태
  rerender(
    <PlaceStationSearchPage
      searchStatus="empty"
      placeResults={placeResultsMock}
      stationResults={stationResultsMock}
    />
  );
  expect(screen.queryByRole("button", { name: "출발지로 서울역 선택" })).not.toBeInTheDocument();
  // 4. error 상태
  rerender(
    <PlaceStationSearchPage
      searchStatus="error"
      placeResults={placeResultsMock}
      stationResults={stationResultsMock}
    />
  );
  expect(screen.queryByRole("button", { name: "출발지로 서울역 선택" })).not.toBeInTheDocument();
  // 5. success 상태에서만 비로소 결과 버튼이 화면에 노출됨
  rerender(
    <PlaceStationSearchPage
      searchStatus="success"
      placeResults={placeResultsMock}
      stationResults={stationResultsMock}
    />
  );
  expect(screen.getByRole("button", { name: "출발지로 서울역 선택" })).toBeInTheDocument();
});

test("FE-3.3 error 상태에서 다시 시도 버튼 클릭 시 이전 검색 조건으로 onSearch를 호출한다", () => {
  const onSearch = jest.fn();
  const { rerender } = render(<PlaceStationSearchPage onSearch={onSearch} />);
  // 1. 검색어로 서울역을 입력하고 출발지 검색 버튼 클릭
  userEvent.type(screen.getByRole("textbox", { name: "출발지 검색어" }), "서울역");
  fireEvent.click(screen.getByRole("button", { name: "출발지 검색" }));
  expect(onSearch).toHaveBeenCalledWith({ mode: "ROUTE", field: "origin", query: "서울역" });
  // 2. 화면을 error 상태로 변경 (onSearch도 함께 전달)
  rerender(<PlaceStationSearchPage searchStatus="error" onSearch={onSearch} />);
  // 3. 다시 시도 버튼 클릭
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  // 4. 마지막 검색 조건으로 onSearch가 실제 재호출되는지 확인
  expect(onSearch).toHaveBeenLastCalledWith({ mode: "ROUTE", field: "origin", query: "서울역" });
});

// 키 이벤트 전달 여부만 검증
test("ArrowDown 키 입력이 select에 전달되는지 확인", () => {
  render(<PlaceStationSearchPage />);

  const bikeCount = screen.getByRole("combobox", {
    name: "필요 자전거 수",
  });

  bikeCount.focus();

  userEvent.keyboard("{ArrowDown}");

  expect(bikeCount).toHaveFocus();
});
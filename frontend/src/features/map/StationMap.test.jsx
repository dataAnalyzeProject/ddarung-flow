import { fireEvent, render, screen } from "@testing-library/react";
import StationMap from "./StationMap";
import { initialViewport, stationMapFixture } from "./data/stationMapFixture";

test("마커와 재고를 표시하고 viewport 및 선택 값을 전달한다", () => {
  const onViewportChanged = jest.fn();
  const onStationSelected = jest.fn();

  render(<StationMap stations={stationMapFixture} viewport={initialViewport} onViewportChanged={onViewportChanged} onStationSelected={onStationSelected} />);

  expect(screen.getByText("성수역 3번 출구")).toBeInTheDocument();
  expect(screen.getByText("0대")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "현재 위치" })).toBeInTheDocument();
  expect(onViewportChanged).toHaveBeenCalledWith(initialViewport);

  fireEvent.click(screen.getByRole("button", { name: /성수역 3번 출구/ }));
  expect(onStationSelected).toHaveBeenCalledWith(stationMapFixture[0]);
});

test("빈 목록과 위치 권한 거부 상태를 안내한다", () => {
  const { rerender } = render(<StationMap viewport={initialViewport} />);

  expect(screen.getByText("현재 지도 범위에 대여소가 없습니다.")).toBeInTheDocument();
  rerender(<StationMap viewport={initialViewport} locationState="denied" />);
  expect(screen.getByRole("alert")).toHaveTextContent("위치 권한");
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import PlaceAutocompleteInput from "./PlaceAutocompleteInput";
import { searchPlaces } from "./kakaoMapApi";

jest.mock("./kakaoMapApi", () => ({ searchPlaces: jest.fn() }));

test("현재 입력창 아래에 해당 장소 후보만 표시한다", async () => {
  jest.useFakeTimers();
  searchPlaces.mockResolvedValue({ places: [{ placeId: "1", name: "천마산역", address: "경기 남양주시" }] });
  const onSelect = jest.fn();
  const { rerender } = render(<PlaceAutocompleteInput label="출발지" value="" placeholder="출발지" onChange={() => {}} onSelect={onSelect} />);
  rerender(<PlaceAutocompleteInput label="출발지" value="천마산역" placeholder="출발지" onChange={() => {}} onSelect={onSelect} />);
  fireEvent.focus(screen.getByPlaceholderText("출발지"));
  act(() => jest.advanceTimersByTime(300));
  expect(await screen.findByRole("button", { name: /천마산역/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("목적지 검색 결과")).not.toBeInTheDocument();
  jest.useRealTimers();
});

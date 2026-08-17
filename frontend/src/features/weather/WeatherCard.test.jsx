import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WeatherCard from "./WeatherCard";
import {
  delayedWeather,
  missingWeather,
  normalWeather,
  rainyWeather,
  unavailableWeather,
} from "./data/weatherForecastMock";

test("정상 카드에 도착시간, 기온, 강수확률과 날씨를 표시한다", () => {
  render(<WeatherCard weather={normalWeather} />);
  expect(screen.getByText("18:20")).toBeInTheDocument();
  expect(screen.getByText("27°C")).toBeInTheDocument();
  expect(screen.getByText("30%")).toBeInTheDocument();
  expect(screen.getByText("구름 많음")).toBeInTheDocument();
});

test("승인 계약의 격자 위치 객체를 안전한 문구로 표시한다", () => {
  render(<WeatherCard weather={{ ...normalWeather, location: { nx: 60, ny: 127 } }} />);
  expect(screen.getByText("격자 좌표 X 60 · Y 127")).toBeInTheDocument();
});

test("MOSTLY_CLOUDY를 구름 많음으로 표시한다", () => {
  render(<WeatherCard weather={{ ...normalWeather, precipitationType: "NONE", skyStatus: "MOSTLY_CLOUDY" }} />);
  expect(screen.getByText("구름 많음")).toBeInTheDocument();
});

test("버튼으로 시간대별 예보를 펼치고 접는다", async () => {
  const onToggle = jest.fn();
  const { rerender } = render(<WeatherCard weather={normalWeather} expanded={false} onToggle={onToggle} />);
  await userEvent.click(screen.getByRole("button", { name: "시간대별 예보 펼치기" }));
  expect(onToggle).toHaveBeenCalledTimes(1);
  rerender(<WeatherCard weather={normalWeather} expanded onToggle={onToggle} />);
  expect(screen.getByRole("list", { name: "시간대별 예보" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "시간대별 예보 접기" }));
  expect(onToggle).toHaveBeenCalledTimes(2);
});

test("시간대별 예보를 forecastAt 오름차순으로 표시한다", () => {
  const reversed = { ...normalWeather, hourlyForecasts: [...normalWeather.hourlyForecasts].reverse() };
  const { container } = render(<WeatherCard weather={reversed} expanded />);
  expect([...container.querySelectorAll("time")].map((node) => node.textContent)).toEqual(["18:00", "19:00", "20:00"]);
});

test.each([
  [49, "NONE", false],
  [50, "NONE", true],
  [10, "RAIN", true],
  [10, "RAIN_SNOW", true],
  [10, "SNOW", true],
  [10, "SHOWER", true],
])("강수 경계와 형태 계약을 따른다: POP %s, %s", (pop, type, guidance) => {
  const weather = { ...normalWeather, precipitationProbabilityPercent: pop, precipitationType: type, rainGuidance: guidance };
  render(<WeatherCard weather={weather} />);
  const text = "도착 예정 시간대에 강수 가능성이 있습니다. 이동 전 날씨를 확인하세요.";
  if (guidance) expect(screen.getByText(text)).toBeInTheDocument();
  else expect(screen.queryByText(text)).not.toBeInTheDocument();
});

test("DELAYED 상태에 지연 라벨과 실제 발표시각을 표시한다", () => {
  render(<WeatherCard weather={delayedWeather} />);
  expect(screen.getByText("지연")).toBeInTheDocument();
  expect(screen.getByText(/실제 발표시각 2026-08-11 14:00/)).toBeInTheDocument();
});

test.each([
  [missingWeather, "도착 예정시간의 날씨 예보가 없습니다."],
  [unavailableWeather, "날씨 예보를 불러오지 못했습니다."],
])("실패 상태에는 승인 문구만 표시하고 우천 안내를 숨긴다", (weather, message) => {
  render(<WeatherCard weather={{ ...weather, rainGuidance: true }} />);
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(screen.queryByText(/강수 가능성이 있습니다/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("UNAVAILABLE 상태에서 제공된 재시도 동작을 실행한다", async () => {
  const onRetry = jest.fn();
  render(<WeatherCard weather={unavailableWeather} onRetry={onRetry} />);

  await userEvent.click(screen.getByRole("button", { name: "날씨 다시 시도" }));

  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("Tab과 Enter로 펼치기 버튼을 조작한다", async () => {
  const onToggle = jest.fn();
  render(<WeatherCard weather={rainyWeather} onToggle={onToggle} />);
  await userEvent.tab();
  expect(screen.getByRole("button", { name: "시간대별 예보 펼치기" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(onToggle).toHaveBeenCalledTimes(1);
});

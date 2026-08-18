import { fireEvent, render, screen, within } from "@testing-library/react";
import RidingGuidePage from "./RidingGuidePage";
import {
  airQualityDelayedFixture,
  airQualityMissingFixture,
  airQualityNormalFixture,
  airQualityPartialNullFixture,
  airQualityUnavailableFixture,
} from "./data/airQualityMock";

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

  test("Q&A menu calls the supplied navigation callback", () => {
    const onNavigate = jest.fn();
    render(<RidingGuidePage onBack={jest.fn()} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Q&A" }));

    expect(onNavigate).toHaveBeenCalledWith("qna");
  });

  test("shared header logo returns through the supplied main callback", () => {
    const onBack = jest.fn();
    render(<RidingGuidePage onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "대여 예측 메인으로 이동" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("라이딩 가이드 대기질 상태", () => {
  test("NORMAL 상태는 측정소, 측정시간과 모든 오염물질 수치·등급을 표시한다", () => {
    render(<RidingGuidePage airQuality={airQualityNormalFixture} onBack={jest.fn()} />);

    expect(screen.getByText("천호 측정소")).toBeInTheDocument();
    expect(screen.getByText("10:00 기준")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("0.031")).toBeInTheDocument();
    expect(screen.getAllByText("보통", { selector: ".guide-air-values em" })).toHaveLength(2);
    expect(screen.getByText("좋음", { selector: ".guide-air-values em" })).toBeInTheDocument();
  });

  test("DELAYED 상태는 측정시각을 유지하며 지연 문구를 표시한다", () => {
    render(<RidingGuidePage airQuality={airQualityDelayedFixture} onBack={jest.fn()} />);

    expect(screen.getByText("07:40 기준")).toBeInTheDocument();
    expect(screen.getByText("측정값 갱신이 지연되고 있어요.")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
  });

  test("PM2.5 한 항목이 null이면 해당 값만 대시로 표시하고 나머지는 유지한다", () => {
    render(<RidingGuidePage airQuality={airQualityPartialNullFixture} onBack={jest.fn()} />);

    expect(screen.getByLabelText("PM2.5 측정값 없음")).toHaveTextContent("-");
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("0.031")).toBeInTheDocument();
  });

  test("MISSING 상태에서는 수치나 좋음 문구 없이 안내 메시지만 표시한다", () => {
    render(<RidingGuidePage airQuality={airQualityMissingFixture} onBack={jest.fn()} />);
    const airCard = screen.getByRole("heading", { name: "도착지 대기질" }).closest("section");

    expect(within(airCard).getByText("측정값이 없어 대기질을 표시할 수 없어요.")).toBeInTheDocument();
    expect(within(airCard).queryByText("㎍/㎥")).not.toBeInTheDocument();
    expect(within(airCard).queryByText("좋음")).not.toBeInTheDocument();
    expect(within(airCard).queryByText("42")).not.toBeInTheDocument();
  });

  test("UNAVAILABLE 상태에서는 수치나 좋음 문구 없이 조회 불가 메시지만 표시한다", () => {
    render(<RidingGuidePage airQuality={airQualityUnavailableFixture} onBack={jest.fn()} />);
    const airCard = screen.getByRole("heading", { name: "도착지 대기질" }).closest("section");

    expect(within(airCard).getByText("대기질 정보를 조회할 수 없어요.")).toBeInTheDocument();
    expect(within(airCard).queryByText("좋음")).not.toBeInTheDocument();
    expect(within(airCard).queryByText("18")).not.toBeInTheDocument();
  });

  test("loading 상태에서는 값 대신 불러오는 중 안내를 표시한다", () => {
    render(<RidingGuidePage isAirQualityLoading onBack={jest.fn()} />);
    const airCard = screen.getByRole("heading", { name: "도착지 대기질" }).closest("section");

    expect(within(airCard).getByText("대기질 정보를 불러오는 중이에요.")).toBeInTheDocument();
    expect(within(airCard).queryByText("천호 측정소")).not.toBeInTheDocument();
  });

  test("대기질 상태와 무관하게 대여 확률과 종합 추천 문구는 바뀌지 않는다", () => {
    render(<RidingGuidePage airQuality={airQualityUnavailableFixture} onBack={jest.fn()} />);

    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText("추천해요.")).toBeInTheDocument();
    expect(screen.getByText("매우 높음")).toBeInTheDocument();
  });

  test("측정소 응답이 두 항목 모두 정상 등급이어도 통합대기환경지수 라벨에 등급명을 포함한다", () => {
    render(<RidingGuidePage airQuality={airQualityNormalFixture} onBack={jest.fn()} />);

    expect(screen.getByLabelText("통합대기환경지수 보통")).toBeInTheDocument();
  });

  test("실제 후보(candidate)가 있으면 고정 87% 대신 선택 수량 확률과 낮음·중간·높음 등급을 표시한다", () => {
    const candidate = {
      stationId: "ST-3",
      stationName: "서울숲 남문",
      arrivalAt: "2026-08-04T15:51:00+09:00",
      predictionTargetAt: "2026-08-04T16:00:00+09:00",
      targetOffsetMinutes: 9,
      featureAsOf: "2026-08-04T15:00:00+09:00",
      horizonMinutes: 60,
      availabilityLevel: "LOW",
      selectedProbability: 0.31,
      probabilities: { atLeast1: 0.49, atLeast2: 0.31, atLeast3: 0.19, atLeast4: 0.11, atLeast5: 0.05 },
      currentInventory: { availableBikeCount: 2, collectedAt: "2026-08-04T15:02:10+09:00", inventoryStatus: "NORMAL" },
      predictionGeneratedAt: "2026-08-04T15:03:00+09:00",
      predictionStatus: "NORMAL",
      modelVersion: "availability-v1",
    };

    render(<RidingGuidePage candidate={candidate} onBack={jest.fn()} />);

    expect(screen.getByText("31%")).toBeInTheDocument();
    expect(screen.getByText("낮음")).toBeInTheDocument();
    expect(screen.queryByText("87%")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1~5대 누적확률 보기" }));
    expect(screen.getByText("49%")).toBeInTheDocument();
  });

  test("candidate가 없으면 기존 고정 안내(87%·매우 높음·추천해요)를 유지한다", () => {
    render(<RidingGuidePage onBack={jest.fn()} />);

    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText("매우 높음")).toBeInTheDocument();
    expect(screen.getByText("추천해요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1~5대 누적확률 보기" })).not.toBeInTheDocument();
  });

  test("도착지 날씨는 실제 arrivalWeather 값을 표시하고 비 가능성이 있으면 주의사항에 안내한다", () => {
    const arrivalWeather = {
      status: "NORMAL",
      temperatureC: 30,
      precipitationProbabilityPercent: 60,
      precipitationType: "RAIN",
      skyStatus: "OVERCAST",
      rainGuidance: true,
      hourlyForecasts: [],
    };

    render(<RidingGuidePage arrivalWeather={arrivalWeather} onBack={jest.fn()} />);
    const weatherCard = screen.getByRole("heading", { name: "도착지 날씨" }).closest("section");

    expect(within(weatherCard).getByText("30°C")).toBeInTheDocument();
    expect(within(weatherCard).getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("도착 예정 시간대에 강수 가능성이 있어요.")).toBeInTheDocument();
  });

  test("DELAYED 상태에서는 종합 요약의 통합대기환경지수가 airQuality.khai 값(71)로 표시된다", () => {
    render(<RidingGuidePage airQuality={airQualityDelayedFixture} onBack={jest.fn()} />);
    const khaiSummary = screen.getByText("통합대기환경지수").closest("div").querySelector("dd");

    expect(khaiSummary).toHaveTextContent("71");
    expect(khaiSummary).toHaveTextContent("보통");
  });

  test("MISSING/UNAVAILABLE 상태에서는 종합 요약의 통합대기환경지수에 이전 수치나 긍정 등급이 남지 않는다", () => {
    const { rerender } = render(<RidingGuidePage airQuality={airQualityMissingFixture} onBack={jest.fn()} />);
    let khaiSummary = screen.getByText("통합대기환경지수").closest("div").querySelector("dd");

    expect(khaiSummary).not.toHaveTextContent("63");
    expect(khaiSummary).not.toHaveTextContent("보통");
    expect(khaiSummary).toHaveTextContent("-");

    rerender(<RidingGuidePage airQuality={airQualityUnavailableFixture} onBack={jest.fn()} />);
    khaiSummary = screen.getByText("통합대기환경지수").closest("div").querySelector("dd");

    expect(khaiSummary).not.toHaveTextContent("63");
    expect(khaiSummary).not.toHaveTextContent("보통");
    expect(khaiSummary).toHaveTextContent("-");
  });
});

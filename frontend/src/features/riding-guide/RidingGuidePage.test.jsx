import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RidingGuidePage from "./RidingGuidePage";
import {
  airQualityDelayedFixture,
  airQualityMissingFixture,
  airQualityNormalFixture,
  airQualityPartialNullFixture,
  airQualityUnavailableFixture,
} from "./data/airQualityMock";
import { ridingGuideStateFixtures } from "./data/ridingGuideFixture";
import ArrivalWeatherCard from "./components/ArrivalWeatherCard";
import DataStatusFooter from "./components/DataStatusFooter";
import PredictionSummaryCard from "./components/PredictionSummaryCard";
import { fetchPredictionReliability } from "./predictionReliabilityApi";

jest.mock("./predictionReliabilityApi", () => ({
  fetchPredictionReliability: jest.fn(),
}));

const reliabilityCandidate = {
  stationId: "ST-3",
  selectedProbability: 0.72,
  horizonMinutes: 120,
  requiredBikeCount: 3,
  predictionStatus: "NORMAL",
  probabilities: { atLeast1: 0.85, atLeast2: 0.72, atLeast3: 0.61, atLeast4: 0.47, atLeast5: 0.34 },
  modelVersion: "availability-v1",
};

beforeEach(() => {
  fetchPredictionReliability.mockResolvedValue(null);
});

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

  test("전달받은 로그인 상태를 공통 헤더에 표시한다", () => {
    render(<RidingGuidePage stationName="서울숲 남문" onBack={jest.fn()} authState="authenticated" user={{ displayName: "김따릉", provider: "kakao" }} onLogout={jest.fn()} />);

    expect(screen.getByRole("button", { name: "김따릉 · 내 계정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
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

describe("예측 신뢰도 공개", () => {
  test("접힌 상세 영역에서 실측 적중률과 신뢰도를 표시한다", async () => {
    fetchPredictionReliability.mockResolvedValue({
      reliabilityLevel: "MEDIUM",
      band: { accuracyRate: 0.83, sampleCount: 41207 },
      disclosure: "겨울 8일 구간 평가 결과이며 계절성은 반영되지 않았습니다.",
    });
    render(<PredictionSummaryCard candidate={reliabilityCandidate} />);

    fireEvent.click(screen.getByRole("button", { name: "1~5대 누적확률 보기" }));

    await waitFor(() => expect(screen.getByText("83%")).toBeInTheDocument());
    expect(screen.getByText("●●●○○ 보통")).toBeInTheDocument();
    expect(screen.getByText("겨울 8일 구간 평가 결과이며 계절성은 반영되지 않았습니다.")).toBeInTheDocument();
  });

  test("UNKNOWN은 적중률 대신 표본 부족 문구를, 404는 신뢰도 블록을 숨긴다", async () => {
    fetchPredictionReliability.mockResolvedValue({ reliabilityLevel: "UNKNOWN", band: {} });
    const { rerender } = render(<PredictionSummaryCard candidate={reliabilityCandidate} />);

    fireEvent.click(screen.getByRole("button", { name: "1~5대 누적확률 보기" }));
    await waitFor(() => expect(screen.getByText("검증 표본이 부족합니다")).toBeInTheDocument());
    expect(screen.queryByText("이 구간 실측 적중률")).not.toBeInTheDocument();

    fetchPredictionReliability.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    rerender(<PredictionSummaryCard candidate={{ ...reliabilityCandidate, stationId: "ST-4" }} />);
    await waitFor(() => expect(screen.queryByText("검증 표본이 부족합니다")).not.toBeInTheDocument());
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
  });

  test("측정소와의 거리 정보가 있으면 대기질 카드에 별도 행으로 표시한다", () => {
    render(<RidingGuidePage airQuality={airQualityNormalFixture} onBack={jest.fn()} />);
    const airCard = screen.getByRole("heading", { name: "도착지 대기질" }).closest("section");

    expect(within(airCard).getByText("대여소와의 거리")).toBeInTheDocument();
    expect(within(airCard).getByText("420m")).toBeInTheDocument();
    expect(within(airCard).getByText("천호 측정소")).toBeInTheDocument();
  });

  test("거리 정보가 없으면 거리 행을 표시하지 않는다", () => {
    render(<RidingGuidePage airQuality={airQualityDelayedFixture} onBack={jest.fn()} />);
    const airCard = screen.getByRole("heading", { name: "도착지 대기질" }).closest("section");

    expect(within(airCard).queryByText("대여소와의 거리")).not.toBeInTheDocument();
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
      requiredBikeCount: 2,
    };

    render(<RidingGuidePage candidate={candidate} onBack={jest.fn()} />);

    expect(screen.getByText("31%")).toBeInTheDocument();
    expect(screen.queryByText("87%")).not.toBeInTheDocument();

    const summaryCard = screen.getByRole("heading", { name: "대여 예측 요약" }).closest("section");
    expect(within(summaryCard).getByText(/낮음/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1~5대 누적확률 보기" }));
    expect(screen.getByText("49%")).toBeInTheDocument();

    const highlightedRow = screen.getByText("2대 이상").closest("div");
    expect(highlightedRow).toHaveClass("current");
    expect(screen.getByText("1대 이상").closest("div")).not.toHaveClass("current");
  });

  test("종합판정이 주의(LOW)이면 인트로 배지·요약 문구가 바뀐다", () => {
    const lowCandidate = {
      stationId: "ST-3",
      availabilityLevel: "LOW",
      selectedProbability: 0.31,
      predictionStatus: "NORMAL",
      currentInventory: {},
    };

    render(<RidingGuidePage candidate={lowCandidate} onBack={jest.fn()} />);

    expect(screen.getByText("이용 시 주의")).toBeInTheDocument();
    expect(screen.getByText("대여 가능성이나 날씨·대기질 상황을 확인하고 이용해주세요.")).toBeInTheDocument();
  });

  test("candidate가 없으면 고정 지표(87%·추천해요)와 안내 문구를 보여준다", () => {
    render(<RidingGuidePage onBack={jest.fn()} />);

    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText("추천해요.")).toBeInTheDocument();
    expect(screen.getByText(/실제 예측을 실행하면/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1~5대 누적확률 보기" })).not.toBeInTheDocument();
  });

  test("대여소 상세보기 링크는 더 이상 표시하지 않는다", () => {
    render(<RidingGuidePage onBack={jest.fn()} />);

    expect(screen.queryByRole("link", { name: /상세보기/ })).not.toBeInTheDocument();
  });

  test("대안 이동 카드는 더 이상 표시하지 않는다", () => {
    render(<RidingGuidePage onBack={jest.fn()} />);

    expect(screen.queryByRole("heading", { name: "대안 이동" })).not.toBeInTheDocument();
  });

  test("낮은 가용성이면 주의사항에 대체 대여소 확인 안내가 뜬다", () => {
    const candidate = { availabilityLevel: "LOW", currentInventory: {} };
    render(<RidingGuidePage candidate={candidate} onBack={jest.fn()} />);

    expect(screen.getByText(/대여 가능성이 낮아요/)).toBeInTheDocument();
  });

  test("재고가 지연 상태면 주의사항에 지연 안내가 뜬다", () => {
    const candidate = {
      currentInventory: { availableBikeCount: 3, collectedAt: "2026-08-04T15:02:10+09:00", inventoryStatus: "DELAYED" },
    };
    render(<RidingGuidePage candidate={candidate} onBack={jest.fn()} />);

    expect(screen.getByText(/재고 정보가 지연되고 있어요/)).toBeInTheDocument();
  });

  test("시간대별 예보에서 비가 시작되는 시각이 있으면 주의사항에 구체적으로 안내한다", () => {
    const arrivalWeather = {
      status: "NORMAL",
      temperatureC: 22,
      precipitationProbabilityPercent: 10,
      precipitationType: "NONE",
      skyStatus: "CLEAR",
      rainGuidance: false,
      hourlyForecasts: [
        { forecastAt: "2026-08-04T15:00:00+09:00", temperatureC: 22, precipitationProbabilityPercent: 20, precipitationType: "NONE", skyStatus: "CLEAR" },
        { forecastAt: "2026-08-04T17:00:00+09:00", temperatureC: 21, precipitationProbabilityPercent: 60, precipitationType: "RAIN", skyStatus: "OVERCAST" },
      ],
    };

    render(<RidingGuidePage arrivalWeather={arrivalWeather} onBack={jest.fn()} />);

    expect(screen.getByText("17시부터 강수확률 60%로 올라요.")).toBeInTheDocument();
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

describe("라이딩 가이드 카드 분리 (FE-4.6)", () => {
  test.each(["success", "loading", "empty", "error", "stale"])(
    "%s 상태 fixture로 화면 전체가 정상 렌더링된다",
    (stateName) => {
      const fixture = ridingGuideStateFixtures[stateName];
      render(
        <RidingGuidePage
          stationName="성수역 3번 출구"
          onBack={jest.fn()}
          candidate={fixture.candidate}
          arrivalWeather={fixture.arrivalWeather}
          isWeatherLoading={fixture.isWeatherLoading}
          airQuality={fixture.airQuality}
          isAirQualityLoading={fixture.isAirQualityLoading}
        />
      );

      expect(screen.getByRole("heading", { name: "종합 라이딩 가이드" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "대여 예측 요약" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "주의사항" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "도착지 날씨" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "도착지 대기질" })).toBeInTheDocument();
      expect(screen.getByLabelText("데이터 상태")).toBeInTheDocument();
    }
  );

  test("empty fixture에서 날씨·대기질 카드가 안내 메시지를 보여도 다른 카드는 유지된다", () => {
    const fixture = ridingGuideStateFixtures.empty;
    render(
      <RidingGuidePage
        stationName="성수역 3번 출구"
        onBack={jest.fn()}
        candidate={fixture.candidate}
        arrivalWeather={fixture.arrivalWeather}
        isWeatherLoading={fixture.isWeatherLoading}
        airQuality={fixture.airQuality}
        isAirQualityLoading={fixture.isAirQualityLoading}
      />
    );

    const weatherCard = screen.getByRole("heading", { name: "도착지 날씨" }).closest("section");
    expect(within(weatherCard).getByText("도착 예정시간의 날씨 예보가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "종합 라이딩 가이드" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "대여 예측 요약" })).toBeInTheDocument();
  });

  test("error fixture에서 날씨·대기질 카드가 조회 불가 메시지를 보여도 다른 카드는 유지된다", () => {
    const fixture = ridingGuideStateFixtures.error;
    render(
      <RidingGuidePage
        stationName="성수역 3번 출구"
        onBack={jest.fn()}
        candidate={fixture.candidate}
        arrivalWeather={fixture.arrivalWeather}
        isWeatherLoading={fixture.isWeatherLoading}
        airQuality={fixture.airQuality}
        isAirQualityLoading={fixture.isAirQualityLoading}
      />
    );

    const weatherCard = screen.getByRole("heading", { name: "도착지 날씨" }).closest("section");
    expect(within(weatherCard).getByText("날씨 예보를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "종합 라이딩 가이드" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "주의사항" })).toBeInTheDocument();
  });

  test("stale fixture에서 날씨·대기질·재고 카드 모두 지연 안내를 표시한다", () => {
    const fixture = ridingGuideStateFixtures.stale;
    render(
      <RidingGuidePage
        stationName="성수역 3번 출구"
        onBack={jest.fn()}
        candidate={fixture.candidate}
        arrivalWeather={fixture.arrivalWeather}
        isWeatherLoading={fixture.isWeatherLoading}
        airQuality={fixture.airQuality}
        isAirQualityLoading={fixture.isAirQualityLoading}
      />
    );

    expect(screen.getByText("날씨 발표가 지연되어 직전 발표 값을 표시합니다.")).toBeInTheDocument();
    expect(screen.getByText("측정값 갱신이 지연되고 있어요.")).toBeInTheDocument();
    expect(screen.getByText(/재고 정보가 지연되고 있어요/)).toBeInTheDocument();
  });

  test("loading fixture에서는 날씨·대기질 카드에 불러오는 중 안내가 표시된다", () => {
    const fixture = ridingGuideStateFixtures.loading;
    render(
      <RidingGuidePage
        stationName="성수역 3번 출구"
        onBack={jest.fn()}
        candidate={fixture.candidate}
        arrivalWeather={fixture.arrivalWeather}
        isWeatherLoading={fixture.isWeatherLoading}
        airQuality={fixture.airQuality}
        isAirQualityLoading={fixture.isAirQualityLoading}
      />
    );

    expect(screen.getByText("도착지 날씨를 불러오는 중이에요.")).toBeInTheDocument();
    expect(screen.getByText("대기질 정보를 불러오는 중이에요.")).toBeInTheDocument();
  });

  test("OverallGuideCard와 RidingGuideHeader의 복귀 콜백은 동일한 onBack을 각각 호출한다", () => {
    const onBack = jest.fn();
    render(<RidingGuidePage stationName="성수역 3번 출구" onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "대여 예측으로 돌아가기" }));
    fireEvent.click(screen.getByRole("button", { name: "경로 다시 보기" }));

    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

describe("라이딩 가이드 카드 방어 렌더링 회귀 테스트", () => {
  test("ArrivalWeatherCard는 weather prop이 없어도 크래시 없이 기본값으로 렌더링된다", () => {
    render(<ArrivalWeatherCard weather={null} />);

    expect(screen.getByRole("heading", { name: "도착지 날씨" })).toBeInTheDocument();
    expect(screen.getByText("24°C")).toBeInTheDocument();
  });

  test("DataStatusFooter는 weather prop이 없어도 크래시 없이 기본값으로 렌더링된다", () => {
    render(<DataStatusFooter weather={null} airQuality={null} />);

    expect(screen.getByLabelText("데이터 상태")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  test("PredictionSummaryCard는 requiredBikeCount가 0이어도 대수를 포함한 문장을 표시한다", () => {
    const candidate = {
      requiredBikeCount: 0,
      selectedProbability: 0.42,
      availabilityLevel: "MEDIUM",
      predictionStatus: "NORMAL",
      currentInventory: { availableBikeCount: 3, inventoryStatus: "NORMAL" },
    };
    render(<PredictionSummaryCard candidate={candidate} />);

    expect(screen.getByText(/0대 이상 빌릴 수 있을 확률이 42%/)).toBeInTheDocument();
  });
});

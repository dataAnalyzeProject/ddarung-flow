import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MainPage from "./MainPage";
import { getCurrentUser, logout } from "../login/authApi";
import { loadPendingPrediction, savePendingPrediction } from "../login/loginStorage";
import { searchPlaces } from "../map/kakaoMapApi";
import { fetchRouteCandidates } from "../map/candidatesApi";
import { fetchAirQuality } from "../riding-guide/airQualityApi";
import { fetchArrivalWeather } from "../weather/weatherApi";
import { formatStationTime } from "./components/StationRecommendationPanel";

jest.mock("../login/authApi", () => ({
  getCurrentUser: jest.fn(),
  logout: jest.fn(),
  startSocialLogin: jest.fn(),
}));

jest.mock("../map/kakaoMapApi", () => ({ searchPlaces: jest.fn() }));
jest.mock("../map/candidatesApi", () => ({ fetchRouteCandidates: jest.fn() }));
jest.mock("../riding-guide/airQualityApi", () => ({ fetchAirQuality: jest.fn() }));
jest.mock("../weather/weatherApi", () => ({
  adaptArrivalWeather: jest.fn((weather) => weather),
  fetchArrivalWeather: jest.fn(),
}));

test("UTC 도착시각을 Asia/Seoul 시각으로 표시한다", () => {
  expect(formatStationTime("2026-08-17T07:35:00Z")).toBe("오후 4:35");
});

async function selectPlace(labelPlaceholder, resultName, queryText) {
  const input = screen.getByPlaceholderText(labelPlaceholder);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: queryText } });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(resultName) }));
}

describe("시안 6 메인 로그인 통합", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
    logout.mockResolvedValue();
    fetchArrivalWeather.mockResolvedValue({ status: "UNAVAILABLE", hourlyForecasts: [] });
  });

  test("비로그인 예측 입력을 저장하고 기존 로그인 페이지로 연결한다", async () => {
    render(<MainPage />);
    await screen.findByRole("link", { name: "로그인" });

    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeInTheDocument();
    expect(screen.getByLabelText("예측 지도")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("출발지를 입력하세요"), { target: { value: "서울숲" } });
    fireEvent.change(screen.getByPlaceholderText("목적지를 입력하세요"), { target: { value: "성수역" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "예상시간" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "대중교통" }));
    fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측" }));

    expect(screen.getByRole("dialog", { name: "로그인 필요 안내" })).toBeInTheDocument();
    expect(loadPendingPrediction()).toEqual({
      origin: "서울숲",
      destination: "성수역",
      travelMode: "대중교통",
      directMinutes: 25,
      requiredBikeCount: 1,
    });

    expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute("href", "/login");
  });

  test("OAuth 성공 후 저장한 입력을 복원하고 주소의 결과 쿼리를 제거한다", async () => {
    savePendingPrediction({
      origin: "서울역",
      destination: "광화문",
      travelMode: "도보",
      directMinutes: 20,
    });
    window.history.replaceState({}, "", "/?login=success");
    getCurrentUser.mockResolvedValue({
      authenticated: true,
      user: { userId: "user-1", displayName: "따릉이 사용자", provider: "kakao" },
    });

    render(<MainPage />);

    await screen.findByDisplayValue("서울역");
    expect(screen.getByDisplayValue("서울역")).toBeInTheDocument();
    expect(screen.getByDisplayValue("광화문")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    expect(screen.getByText(/따릉이 사용자 · kakao/)).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  test("로그인 사용자가 실제 장소를 선택하지 않고 예측하면 알림 패널을 표시하지 않는다", async () => {
    getCurrentUser.mockResolvedValue({
      authenticated: true,
      user: { userId: "user-1", displayName: "사용자", provider: "google" },
    });

    render(<MainPage />);
    await screen.findByRole("button", { name: "로그아웃" });
    fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측" }));

    expect(screen.queryByText("예측 안내")).not.toBeInTheDocument();
    expect(fetchRouteCandidates).not.toHaveBeenCalled();
  });

  test("로그아웃하면 메인 화면의 비로그인 상태로 돌아간다", async () => {
    getCurrentUser.mockResolvedValue({
      authenticated: true,
      user: { userId: "user-1", displayName: "사용자", provider: "naver" },
    });

    render(<MainPage />);
    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
  });

  test("지도 탭과 확대 축소 컨트롤은 상태를 왕복 변경한다", async () => {
    render(<MainPage />);
    await screen.findByRole("link", { name: "로그인" });

    const mapImage = screen.getByRole("img", { name: "천호동 이동 경로와 추천 대여소 지도" });
    const satellite = screen.getByRole("button", { name: "위성" });
    fireEvent.click(satellite);
    expect(satellite).toHaveAttribute("aria-pressed", "true");
    expect(mapImage).toHaveClass("satellite");

    fireEvent.click(screen.getByRole("button", { name: "지도 확대" }));
    expect(mapImage).toHaveStyle("transform: scale(1.1)");
    fireEvent.click(screen.getByRole("button", { name: "지도 축소" }));
    expect(mapImage).toHaveStyle("transform: scale(1)");
  });

  test("메인 화면에서 하단 인사이트와 즐겨찾기 패널을 렌더링하지 않는다", async () => {
    render(<MainPage />);
    await screen.findByRole("link", { name: "로그인" });

    expect(screen.queryByRole("heading", { name: "천호동 주변 인사이트" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "즐겨찾는 목적지" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  test("Q&A 메뉴는 인앱 화면 전환 콜백을 호출한다", async () => {
    const onNavigate = jest.fn();
    render(<MainPage onNavigate={onNavigate} />);
    await screen.findByRole("link", { name: "로그인" });

    fireEvent.click(screen.getByRole("button", { name: "Q&A" }));
    expect(onNavigate).toHaveBeenCalledWith("qna");
  });

  describe("실제 좌표로 출발지·목적지를 선택한 뒤 예측하는 경우", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      getCurrentUser.mockResolvedValue({
        authenticated: true,
        user: { userId: "user-1", displayName: "사용자", provider: "kakao" },
      });
      searchPlaces.mockResolvedValue({
        places: [{ placeId: "p1", name: "서울숲공원", address: "서울 성동구", latitude: 37.5, longitude: 127.0 }],
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function renderAndSelectPlaces() {
      render(<MainPage />);
      await screen.findByRole("button", { name: "로그아웃" });
      await selectPlace("출발지를 입력하세요", "서울숲공원", "서울숲");
      await selectPlace("목적지를 입력하세요", "서울숲공원", "서울숲");
    }

    test("실제 API 응답을 예측 결과 화면으로 보여준다", async () => {
      fetchRouteCandidates.mockResolvedValue([
        {
          stationId: "ST-9",
          stationName: "테스트 대여소",
          latitude: 37.51,
          longitude: 127.01,
          distanceMeters: 200,
          durationSeconds: 300,
          arrivalAt: "2026-08-15T10:05:00+09:00",
          predictionTargetAt: "2026-08-15T11:00:00+09:00",
          targetOffsetMinutes: 55,
          featureAsOf: "2026-08-15T10:00:00+09:00",
          horizonMinutes: 60,
          availabilityLevel: "HIGH",
          predictionProbability: 0.9,
          probabilities: { atLeast1: 0.95, atLeast2: 0.9, atLeast3: 0.8, atLeast4: 0.6, atLeast5: 0.4 },
          availableBikeCount: 6,
          inventoryCollectedAt: "2026-08-15T10:01:00+09:00",
          inventoryStatus: "NORMAL",
          generatedAt: "2026-08-15T10:02:00+09:00",
          expiresAt: "2026-08-15T12:00:00+09:00",
          predictionStatus: "NORMAL",
          modelVersion: "availability-v1",
        },
      ]);

      await renderAndSelectPlaces();
      fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측" }));

      expect(await screen.findByRole("heading", { name: "테스트 대여소" })).toBeInTheDocument();
      expect(screen.getByText("모델 availability-v1")).toBeInTheDocument();
      expect(fetchRouteCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ originLatitude: 37.5, destinationLatitude: 37.5, requiredBikeCount: 1 })
      );
      expect(fetchArrivalWeather).toHaveBeenCalledWith({
        latitude: 37.51,
        longitude: 127.01,
        arrivalAt: "2026-08-15T10:05:00+09:00",
        location: "테스트 대여소",
      });
    });

    test("후보가 3곳을 넘으면 더 많은 대여소 보기로 나머지를 펼친다", async () => {
      const manyCandidates = Array.from({ length: 5 }, (_, index) => ({
        stationId: `ST-${index}`,
        stationName: `대여소 ${index}`,
        distanceMeters: 200 + index,
        durationSeconds: 300,
        arrivalAt: "2026-08-15T10:05:00+09:00",
        predictionTargetAt: "2026-08-15T11:00:00+09:00",
        targetOffsetMinutes: 55,
        featureAsOf: "2026-08-15T10:00:00+09:00",
        horizonMinutes: 60,
        availabilityLevel: "HIGH",
        predictionProbability: 0.9 - index * 0.01,
        probabilities: { atLeast1: 0.95, atLeast2: 0.9, atLeast3: 0.8, atLeast4: 0.6, atLeast5: 0.4 },
        availableBikeCount: 6,
        inventoryCollectedAt: "2026-08-15T10:01:00+09:00",
        inventoryStatus: "NORMAL",
        generatedAt: "2026-08-15T10:02:00+09:00",
        expiresAt: "2026-08-15T12:00:00+09:00",
        predictionStatus: "NORMAL",
        modelVersion: "availability-v1",
      }));
      fetchRouteCandidates.mockResolvedValue(manyCandidates);

      await renderAndSelectPlaces();
      fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측" }));

      await screen.findByRole("heading", { name: "대여소 0" });
      expect(screen.queryByRole("heading", { name: "대여소 3" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /더 많은 대여소 보기/ }));

      expect(screen.getByRole("heading", { name: "대여소 3" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "대여소 4" })).toBeInTheDocument();
    });

    test("API 실패 시 알림 패널 없이 결과 영역을 유지한다", async () => {
      fetchRouteCandidates.mockRejectedValue(new Error("CANDIDATE_FETCH_FAILED"));

      await renderAndSelectPlaces();
      fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측" }));

      await waitFor(() => expect(fetchRouteCandidates).toHaveBeenCalledTimes(1));
      expect(screen.queryByText("예측 안내")).not.toBeInTheDocument();
    });

    describe("라이딩 가이드 상세 진입 (INT-4.3)", () => {
      const candidateResponse = [
        {
          stationId: "ST-9",
          stationName: "테스트 대여소",
          distanceMeters: 200,
          durationSeconds: 300,
          arrivalAt: "2026-08-15T10:05:00+09:00",
          predictionTargetAt: "2026-08-15T11:00:00+09:00",
          targetOffsetMinutes: 55,
          featureAsOf: "2026-08-15T10:00:00+09:00",
          horizonMinutes: 60,
          availabilityLevel: "HIGH",
          predictionProbability: 0.9,
          probabilities: { atLeast1: 0.95, atLeast2: 0.9, atLeast3: 0.8, atLeast4: 0.6, atLeast5: 0.4 },
          availableBikeCount: 6,
          inventoryCollectedAt: "2026-08-15T10:01:00+09:00",
          inventoryStatus: "NORMAL",
          generatedAt: "2026-08-15T10:02:00+09:00",
          expiresAt: "2026-08-15T12:00:00+09:00",
          predictionStatus: "NORMAL",
          modelVersion: "availability-v1",
        },
      ];

      async function renderWithPredictionResult() {
        fetchRouteCandidates.mockResolvedValue(candidateResponse);
        await renderAndSelectPlaces();
        fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측" }));
        await screen.findByRole("heading", { name: "테스트 대여소" });
      }

      test("대여소 카드를 선택하면 선택 상태로 표시된다", async () => {
        await renderWithPredictionResult();

        fireEvent.click(screen.getByRole("button", { name: "테스트 대여소 대여소 선택" }));

        expect(screen.getByRole("button", { name: "테스트 대여소 대여소 선택" })).toHaveAttribute("aria-pressed", "true");
      });

      test("상세보기 클릭 시 stationId로 1회 실제 조회하고 대기질을 렌더링한다", async () => {
        fetchAirQuality.mockResolvedValue({
          stationId: "ST-9",
          status: "NORMAL",
          message: null,
          measurementStation: { name: "강남구", distanceMeters: 842 },
          measuredAt: "2026-08-16T17:00:00+09:00",
          collectedAt: "2026-08-16T17:03:00+09:00",
          khai: { value: 55, grade: "MODERATE", sourceGradeCode: "2" },
          pm10: { value: 8, unit: "µg/m³", grade: "GOOD", sourceGradeCode: "1" },
          pm25: { value: 2, unit: "µg/m³", grade: "GOOD", sourceGradeCode: "1" },
          o3: { value: 0.035, unit: "ppm", grade: "MODERATE", sourceGradeCode: "2" },
        });

        await renderWithPredictionResult();
        fireEvent.click(screen.getByRole("button", { name: "테스트 대여소 상세보기" }));

        expect(await screen.findByRole("heading", { name: "테스트 대여소 라이딩 가이드" })).toBeInTheDocument();
        expect(fetchAirQuality).toHaveBeenCalledTimes(1);
        expect(fetchAirQuality).toHaveBeenCalledWith("ST-9");
        expect(await screen.findByText("강남구")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText("대기질 정보를 불러오는 중이에요.")).not.toBeInTheDocument());
      });

      test("뒤로가기 시 예측 결과 화면과 선택 상태를 그대로 보존한다", async () => {
        fetchAirQuality.mockResolvedValue({
          stationId: "ST-9",
          status: "MISSING",
          message: null,
          measurementStation: null,
          measuredAt: null,
          collectedAt: "2026-08-16T17:03:00+09:00",
          khai: { value: null, grade: null },
          pm10: { value: null, grade: null },
          pm25: { value: null, grade: null },
          o3: { value: null, grade: null },
        });

        await renderWithPredictionResult();
        fireEvent.click(screen.getByRole("button", { name: "테스트 대여소 상세보기" }));
        await screen.findByRole("heading", { name: "테스트 대여소 라이딩 가이드" });
        await waitFor(() => expect(screen.queryByText("대기질 정보를 불러오는 중이에요.")).not.toBeInTheDocument());

        fireEvent.click(screen.getByRole("button", { name: /대여 예측으로 돌아가기/ }));

        expect(await screen.findByRole("heading", { name: "테스트 대여소" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "테스트 대여소 상세보기" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "테스트 대여소 대여소 선택" })).toHaveAttribute("aria-pressed", "true");
      });

      test("실측 실패 시 화면 전체를 실패시키지 않고 조회 불가 상태로 표시한다", async () => {
        fetchAirQuality.mockRejectedValue(new Error("AIR_QUALITY_FETCH_FAILED"));

        await renderWithPredictionResult();
        fireEvent.click(screen.getByRole("button", { name: "테스트 대여소 상세보기" }));

        expect(await screen.findByRole("heading", { name: "테스트 대여소 라이딩 가이드" })).toBeInTheDocument();
        expect(await screen.findByText("대기질 정보를 조회할 수 없어요.")).toBeInTheDocument();
        expect(fetchAirQuality).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByText("대기질 정보를 불러오는 중이에요.")).not.toBeInTheDocument());
      });
    });
  });
});

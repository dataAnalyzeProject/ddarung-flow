import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MainPage from "./MainPage";
import { getCurrentUser, logout } from "../login/authApi";
import { loadPendingPrediction, savePendingPrediction } from "../login/loginStorage";

jest.mock("../login/authApi", () => ({
  getCurrentUser: jest.fn(),
  logout: jest.fn(),
  startSocialLogin: jest.fn(),
}));

describe("시안 6 메인 로그인 통합", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue({ authenticated: false, user: null });
    logout.mockResolvedValue();
  });

  test("비로그인 예측 입력을 저장하고 기존 로그인 페이지로 연결한다", async () => {
    render(<MainPage />);
    await screen.findByRole("link", { name: "로그인" });

    expect(screen.getByLabelText("예측 지도")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "성수역 3번 출구" })).toBeInTheDocument();
    expect(screen.queryByText("로그인 후 확인")).not.toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("출발지를 입력하세요"), { target: { value: "서울숲" } });
    fireEvent.change(screen.getByPlaceholderText("목적지를 입력하세요"), { target: { value: "성수역" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "예상시간" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "대중교통" }));
    fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측" }));

    expect(screen.getByRole("dialog", { name: "로그인 필요 안내" })).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
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

    expect(await screen.findByText("입력값을 불러왔습니다")).toBeInTheDocument();
    expect(screen.getByDisplayValue("서울역")).toBeInTheDocument();
    expect(screen.getByDisplayValue("광화문")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    expect(screen.getByText(/따릉이 사용자 · kakao/)).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  test("로그인 사용자는 메인에서 예시 예측 결과를 확인한다", async () => {
    getCurrentUser.mockResolvedValue({
      authenticated: true,
      user: { userId: "user-1", displayName: "사용자", provider: "google" },
    });

    render(<MainPage />);
    await screen.findByRole("button", { name: "로그아웃" });
    fireEvent.click(screen.getByRole("button", { name: "대여 가능성 예측" }));

    expect(screen.getByText("목적지 주변 대여소")).toBeInTheDocument();
    expect(screen.getByText("화면 확인용 예시 결과 · 대여소 3곳")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
  });

  test("로그아웃하면 메인 화면의 비로그인 상태로 돌아간다", async () => {
    getCurrentUser.mockResolvedValue({
      authenticated: true,
      user: { userId: "user-1", displayName: "사용자", provider: "naver" },
    });

    render(<MainPage />);
    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("로그아웃되었습니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
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

  test("대여소 상세보기는 독립 버튼으로 가이드를 열고 기존 메인 상태를 보존한다", async () => {
    render(<MainPage />);
    await screen.findByRole("link", { name: "로그인" });

    fireEvent.change(screen.getByPlaceholderText("출발지를 입력하세요"), { target: { value: "서울숲" } });
    fireEvent.change(screen.getByPlaceholderText("목적지를 입력하세요"), { target: { value: "천호동" } });
    fireEvent.click(screen.getByRole("button", { name: "성수동 카페거리 대여소 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "성수동 카페거리 상세보기" }));

    expect(screen.getByRole("heading", { name: "성수동 카페거리 라이딩 가이드" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "대여 예측으로 돌아가기" }));

    expect(screen.getByDisplayValue("서울숲")).toBeInTheDocument();
    expect(screen.getByDisplayValue("천호동")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "성수동 카페거리 대여소 선택" })).toHaveAttribute("aria-pressed", "true");
  });

  test("상세보기 버튼은 Enter와 Space 키로 각각 가이드를 연다", async () => {
    render(<MainPage />);
    await screen.findByRole("link", { name: "로그인" });

    const enterDetail = screen.getByRole("button", { name: "성수역 3번 출구 상세보기" });
    enterDetail.focus();
    await userEvent.keyboard("{enter}");
    expect(screen.getByRole("heading", { name: "성수역 3번 출구 라이딩 가이드" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "대여 예측으로 돌아가기" }));
    const spaceDetail = screen.getByRole("button", { name: "서울숲 남문 상세보기" });
    spaceDetail.focus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("heading", { name: "서울숲 남문 라이딩 가이드" })).toBeInTheDocument();
  });

  test("가이드의 경로 다시 보기는 메인 입력과 대여소 선택을 복원한다", async () => {
    render(<MainPage />);
    await screen.findByRole("link", { name: "로그인" });

    await userEvent.type(screen.getByPlaceholderText("출발지를 입력하세요"), "잠실역");
    await userEvent.type(screen.getByPlaceholderText("목적지를 입력하세요"), "천호동");
    await userEvent.click(screen.getByRole("button", { name: "서울숲 남문 대여소 선택" }));
    await userEvent.click(screen.getByRole("button", { name: "서울숲 남문 상세보기" }));
    await userEvent.click(screen.getByRole("button", { name: "경로 다시 보기" }));

    expect(screen.getByDisplayValue("잠실역")).toBeInTheDocument();
    expect(screen.getByDisplayValue("천호동")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "서울숲 남문 대여소 선택" })).toHaveAttribute("aria-pressed", "true");
  });
});

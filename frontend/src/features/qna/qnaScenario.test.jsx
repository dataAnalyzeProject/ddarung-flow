import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QnaPage from "./QnaPage";
describe("4주차 Q&A 필수 5대 사용자 E2E 시나리오 정밀 검증 (userEvent 기반)", () => {
  // -------------------------------------------------------------------------
  // [시나리오 1] USER A의 PUBLIC 및 PRIVATE 질문 연속 작성 및 작성자 뷰 검증
  // -------------------------------------------------------------------------
  test("시나리오 1: 현재 fixture 인증 구조에서 질문 작성자로 설정된 USER A가 PUBLIC과 PRIVATE 질문을 각각 작성하고 내 질문에서 확인한다", () => {
    render(<QnaPage currentUser={{ id: "user-123", name: "USER A" }} />);
    // 1-1. 공개 질문 작성 및 제출
    userEvent.click(screen.getByRole("button", { name: "질문 작성" }));
    userEvent.selectOptions(screen.getByRole("combobox", { name: "질문 분류" }), "SERVICE");
    userEvent.selectOptions(screen.getByRole("combobox", { name: "공개 여부" }), "PUBLIC");
    userEvent.type(screen.getByRole("textbox", { name: "질문 제목" }), "USER A의 공개 질문: 따릉이 반납 오류");
    userEvent.type(screen.getByRole("textbox", { name: "질문 내용" }), "반납 처리가 지연되고 있습니다.");
    userEvent.click(screen.getByRole("button", { name: "질문 등록" }));
    // 등록 즉시 '내 질문' 탭으로 전환되어 방금 쓴 공개 글이 목록에 노출되는지 검증
    expect(screen.getByRole("tab", { name: "내 질문" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("USER A의 공개 질문: 따릉이 반납 오류")).toBeInTheDocument();
    // 1-2. 비공개 질문 작성 및 제출
    userEvent.click(screen.getByRole("button", { name: "질문 작성" }));
    userEvent.selectOptions(screen.getByRole("combobox", { name: "질문 분류" }), "ACCOUNT");
    userEvent.selectOptions(screen.getByRole("combobox", { name: "공개 여부" }), "PRIVATE");
    userEvent.type(screen.getByRole("textbox", { name: "질문 제목" }), "USER A의 비밀 질문: 결제 계정 환불 요청");
    userEvent.type(screen.getByRole("textbox", { name: "질문 내용" }), "개인정보와 환불 계좌가 포함된 비밀 문의입니다.");
    userEvent.click(screen.getByRole("button", { name: "질문 등록" }));
    // 작성자(USER A) 화면에서는 비공개 라벨/배지와 함께 비밀 글이 정상 노출되는지 검증
    expect(screen.getByText("USER A의 비밀 질문: 결제 계정 환불 요청")).toBeInTheDocument();
    expect(screen.getAllByLabelText("비공개").length).toBeGreaterThanOrEqual(1);
  });
  // -------------------------------------------------------------------------
  // [시나리오 2] USER B의 접근 제어 (PUBLIC 목록 격리 및 PRIVATE 상세 404 차단)
  // -------------------------------------------------------------------------
    test("시나리오 2: 전체 목록에는 PUBLIC 질문만 보이고, PRIVATE 질문은 격리된다 (USER B 404 스켈레톤)", () => {
    render(<QnaPage />);
    // 2-1. [현재 검증] 기본 공개 목록에 PUBLIC 질문들이 정상 노출되는지 검증
    expect(screen.getByText("목적지 검색이 안 됩니다")).toBeInTheDocument(); // PUBLIC
    expect(screen.getByText("도착 시간 기준은 어떻게 계산하나요?")).toBeInTheDocument(); // PUBLIC
    // 2-2. [통합 후 검증 스켈레톤] 백엔드/인증 연동 시 USER B 세션으로 A의 PRIVATE 상세 직접 요청 시 404 Not Found 차단 검증
    // TODO: USER B 세션 주입 및 404 에러 화면 단정
  });
  // -------------------------------------------------------------------------
  // [시나리오 3] 작성자(USER A)와 타인(USER B)의 수정/삭제 권한 분리 (403 차단)
  // -------------------------------------------------------------------------
  test("시나리오 3: 작성자만 자기 질문을 수정/삭제할 수 있고 타인은 403 차단된다 (스켈레톤)", () => {
    render(<QnaPage />);
    // 3-1. [현재 검증] 질문 카드 클릭 시 상세 화면으로 정상 진입하는지 확인
    const firstQuestion = screen.getByRole("button", { name: "목적지 검색이 안 됩니다 질문 보기" });
    userEvent.click(firstQuestion);
    expect(screen.getByRole("heading", { name: "목적지 검색이 안 됩니다" })).toBeInTheDocument();
    // 3-2. [통합 후 검증 스켈레톤] 백엔드 연동 시 USER A는 수정/삭제 가능, 타인(USER B)은 403 Forbidden 차단 검증
    // TODO: 수정/삭제 액션 호출 시 403 Forbidden 응답 및 에러 토스트 노출 단정
  });
  // -------------------------------------------------------------------------
  // [시나리오 4] 비로그인 사용자 작성 차단 (401 Unauthorized 및 로그인 유도)
  // -------------------------------------------------------------------------
   test("시나리오 4: 비로그인 사용자가 질문 작성을 시도하면 401 Unauthorized와 로그인 안내를 확인한다 (스켈레톤)", () => {
    const onNavigate = jest.fn();
    render(<QnaPage onNavigate={onNavigate} />);
    // 4-1. [통합 후 검증 스켈레톤] 비로그인 상태에서 '질문 작성' 클릭 시 401 차단 및 로그인 유도 모달 노출 검증
    // TODO: authStorage 비로그인 상태 주입 시 작성 폼 대신 401 로그인 안내 모달/페이지 이동 단정
  });
  // -------------------------------------------------------------------------
  // [시나리오 5] 빈 검색 목록(Empty) vs 서버 장애(500 Error)의 명확한 화면 분기
  // -------------------------------------------------------------------------
 test("시나리오 5: 검색 결과가 없는 빈 화면(Empty)과 서버 장애(500 Error)가 서로 다른 UI로 구별된다", () => {
    render(<QnaPage />);
    // 5-1. [현재 검증] 일치하는 질문이 없을 때 '빈 목록(Empty State)' 전용 안내 문구 노출 검증
    userEvent.type(screen.getByPlaceholderText("제목 또는 내용 검색"), "존재하지않는검색어12345");
    userEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(screen.getByText("조건에 맞는 질문이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /질문 보기/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/서버 오류/)).not.toBeInTheDocument();
    // 5-2. [통합 후 검증 스켈레톤] 백엔드 500 서버 에러 응답 시 전용 에러 안내 화면으로 분기 검증
    // TODO: 500 장애 시 '서버와 연결할 수 없습니다' 배너 및 재시도 버튼 노출 단정
  });
});
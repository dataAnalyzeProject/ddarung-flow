import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QnaPage from "./QnaPage";
import { qnaFixture } from "./data/qnaFixture";

// 1. 검색 및 PUBLIC 질문 노출 검증
test("shows searchable public questions", () => {
    const onSearch = jest.fn();
    const currentUser = {
        id: "user-123",
        name: "따릉이유저",
    };
    render(
        <QnaPage
            status="success"
            view="list"
            questions={qnaFixture}
            currentUser={currentUser}
            onSearch={onSearch}
        />
    );
    // 질문 목록 렌더링 확인
    expect(screen.getByText("예측은 예약을 보장하나요?")).toBeInTheDocument();
    // PUBLIC 질문은 "공개" 표시 확인
    expect(screen.getAllByText(/(?<!비)공개/)[0]).toBeInTheDocument();
});

// 2. ACCOUNT 및 LOCATION 선택 시 PRIVATE 강제 검증
test("forces account and location questions to private", () => {
    render(<QnaPage status="success" view="create" />);
    const categorySelect = screen.getByRole("combobox", { name: "분류" });
    const visibilitySelect = screen.getByRole("combobox", { name: "공개 여부" });
    // ACCOUNT 선택 시 비공개 강제 및 비활성화 확인
    fireEvent.change(categorySelect, { target: { value: "ACCOUNT" } });
    expect(visibilitySelect).toBeDisabled();
    expect(visibilitySelect).toHaveValue("PRIVATE");
    expect(
        screen.getByText(/계정 및 위치 문의는 개인정보 보호를 위해 비공개로 강제 설정됩니다/i)
    ).toBeInTheDocument();
    // LOCATION 선택 시도 동일하게 비공개 강제
    fireEvent.change(categorySelect, { target: { value: "LOCATION" } });
    expect(visibilitySelect).toBeDisabled();
    expect(visibilitySelect).toHaveValue("PRIVATE");
});

// 3. 다양한 상태 (shows loading, empty, error, forbidden, hidden, notFound states) 검증
test("shows loading, empty, error, forbidden, hidden, notFound states", () => {
    const { rerender } = render(<QnaPage status="loading" />);
    expect(document.querySelector(".qna-page__skeleton-container")).toBeInTheDocument();
    rerender(<QnaPage status="empty" />);
    expect(screen.getByText("등록된 질문이 없습니다")).toBeInTheDocument();
    rerender(<QnaPage status="error" />);
    expect(screen.getByText("질문 목록을 불러오지 못했습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    rerender(<QnaPage status="forbidden" />);
    expect(screen.getByText("접근 권한이 없습니다")).toBeInTheDocument();
    rerender(<QnaPage status="hidden" />);
    expect(screen.getByText("관리자에 의해 숨겨진 질문입니다")).toBeInTheDocument();
    rerender(<QnaPage status="notFound" />);
    expect(screen.getByText("질문을 찾을 수 없거나 비공개 질문입니다")).toBeInTheDocument();
});

// 4. 질문 작성 및 승인 규격 payload 제출 검증
test("submits the approved question payload", () => {
    const onSubmit = jest.fn();
    render(<QnaPage status="success" view="create" onSubmit={onSubmit} />);
    userEvent.type(screen.getByRole("textbox", { name: "제목" }), "새로운 질문 제목");
    userEvent.type(screen.getByRole("textbox", { name: "본문" }), "새로운 질문 내용입니다.");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(onSubmit).toHaveBeenCalledWith({
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "새로운 질문 제목",
        body: "새로운 질문 내용입니다.",
    });
});
// 5. 키보드 탐색 검증
test("supports keyboard navigation", () => {
    render(<QnaPage status="success" view="list" questions={qnaFixture} />);
    const searchInput = screen.getByRole("textbox", { name: "검색어 입력" });
    searchInput.focus();
    expect(searchInput).toHaveFocus();
    userEvent.tab(); // 분류 필터 select 포커스
    expect(screen.getByRole("combobox", { name: "분류 필터" })).toHaveFocus();
    userEvent.tab(); // 답변 상태 필터 포커스
    expect(screen.getByRole("combobox", { name: "답변 상태 필터" })).toHaveFocus();
    userEvent.tab(); // 검색 버튼 포커스
    expect(screen.getByRole("button", { name: "검색" })).toHaveFocus();
});

// 6. [담당자 추가 회귀 테스트] 미답변 상태의 작성자 본인 질문일 때만 수정 버튼 노출 검증
test("shows edit button only for unanswered questions by the author", () => {
    const onSelect = jest.fn();
    const currentUser = { id: "user-123", name: "따릉이유저" };
    const question = qnaFixture[2]; // qna-3: authorId "user-123", status "OPEN" (미답변)
    const { rerender } = render(
        <QnaPage
            status="success"
            view="detail"
            selectedQuestion={question}
            currentUser={currentUser}
            onSelect={onSelect}
        />
    );
    const editButton = screen.getByRole("button", { name: "질문 수정" });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);
    expect(onSelect).toHaveBeenCalledWith({ view: "edit", question });
    // 2) 타인 질문일 때 (currentUser id가 다름): 수정 버튼 숨김!
    const otherUser = { id: "user-999", name: "남의계정" };
    rerender(
        <QnaPage
            status="success"
            view="detail"
            selectedQuestion={question}
            currentUser={otherUser}
            onSelect={onSelect}
        />
    );
    expect(screen.queryByRole("button", { name: "질문 수정" })).not.toBeInTheDocument();
});

// 7. [담당자 추가 회귀 테스트] 답변 완료된 질문에는 수정 버튼이 보이지 않음
test("does NOT show edit button for answered questions", () => {
    const onSelect = jest.fn();
    const currentUser = { id: "user-123", name: "따릉이유저" };
    const answeredQuestion = {   // qna-1 과 동일 데이터지만 답변 있음
        id: "qna-1",
        authorId: "user-123",
        authorName: "따릉이유저",
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "예측은 예약을 보장하나요?",
        body: "날씨가 안좋은데 예측을 하면 예약한 자전거를 꼭 탈 수 있나요?",
        status: "CLOSED",  // <--- 답변 완료
        createdAt: "2025-08-11",
        answer: "예측 결과는 참고 정보일 뿐이며 실제 예약은 보장되지 않습니다.",
    };
    render(
        <QnaPage
            status="success"
            view="detail"
            selectedQuestion={answeredQuestion}
            currentUser={currentUser}
            onSelect={onSelect}
        />
    );
    // 답변 완료되었으므로 수정 버튼이 없어야 함!
    expect(screen.queryByRole("button", { name: "질문 수정" })).not.toBeInTheDocument();
});

// 8. [담당자 추가 회귀 테스트] 타인의 PRIVATE 질문은 목록에 표시되지 않음
test("does NOT show other users PRIVATE questions in list", () => {
    const currentUser = { id: "user-123", name: "따릉이유저" };
    const mockQuestions = [
        { id: "qna-1", category: "FAQ", visibility: "PUBLIC", title: "공개 질문" },
        { id: "qna-2", category: "ACCOUNT", visibility: "PRIVATE", authorId: "user-456", title: "타인 비공개 질문" },
        { id: "qna-3", category: "ACCOUNT", visibility: "PRIVATE", authorId: "user-123", title: "내 비공개 질문" }
    ];
    render(<QnaPage status="success" view="list" questions={mockQuestions} currentUser={currentUser} />);
    expect(screen.getByText("공개 질문")).toBeInTheDocument();
    expect(screen.queryByText("타인 비공개 질문")).not.toBeInTheDocument();
    expect(screen.getByText("내 비공개 질문")).toBeInTheDocument();
});

// 9. [담당자 추가 회귀 테스트] 답변 상태와 페이지가 onSearch에 정확히 전달됨
test("passes answerStatus and page to onSearch", () => {
    const onSearch = jest.fn();
    render(<QnaPage status="success" view="list" onSearch={onSearch} />);
    const statusSelect = screen.getByRole("combobox", { name: "답변 상태 필터" });
    fireEvent.change(statusSelect, { target: { value: "OPEN" } });
    const searchButton = screen.getByRole("button", { name: "검색" });
    fireEvent.click(searchButton);
    expect(onSearch).toHaveBeenCalledWith({
        query: "",
        category: "ALL",
        answerStatus: "OPEN",
        page: 1,
    });
});

// 10. [3번 요구사항] 키보드 사용자 실제 동선 (Tab 연속 이동 후 Enter 상세 열기)
test("opens question detail via keyboard Tab and Enter", () => {
    const onSelect = jest.fn();
    render(<QnaPage status="success" view="list" questions={qnaFixture} onSelect={onSelect} />);
    // Tab을 연속으로 눌러 첫 번째 질문 카드까지 이동
    userEvent.tab(); // 1. 질문 작성
    userEvent.tab(); // 2. 검색어 입력
    userEvent.tab(); // 3. 분류 필터
    userEvent.tab(); // 4. 답변 상태 필터
    userEvent.tab(); // 5. 검색 버튼
    userEvent.tab(); // 6. 첫 번째 질문 카드 도착!
    // 카드 버튼 포커스 상태 확인
    const firstQuestionBtn = screen.getByRole("button", {
        name: /질문 상세: 예측은 예약을 보장하나요\?/i,
    });
    expect(firstQuestionBtn).toHaveFocus();
    // Enter 키로 상세 열기
    userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({
        view: "detail",
        question: qnaFixture[0],
    });
});

// 11-1. 제목 최소 길이 경계값 검증
test("saves when title length is 1 character", () => {
    const onSubmit = jest.fn();

    render(
        <QnaPage
            status="success"
            view="create"
            onSubmit={onSubmit}
        />
    );

    userEvent.type(
        screen.getByRole("textbox", { name: "제목" }),
        "A"
    );

    userEvent.type(
        screen.getByRole("textbox", { name: "본문" }),
        "내용입니다."
    );

    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(onSubmit).toHaveBeenCalledWith({
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "A",
        body: "내용입니다.",
    });
});

// 11-2. 제목 최대 길이 경계값 검증
test("saves when title length is 120 characters", () => {
    const onSubmit = jest.fn();

    render(
        <QnaPage
            status="success"
            view="create"
            onSubmit={onSubmit}
        />
    );

    const title120 = "a".repeat(120);

    userEvent.type(
        screen.getByRole("textbox", { name: "제목" }),
        title120
    );

    userEvent.type(
        screen.getByRole("textbox", { name: "본문" }),
        "내용입니다."
    );

    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(onSubmit).toHaveBeenCalledWith({
        category: "GENERAL",
        visibility: "PUBLIC",
        title: title120,
        body: "내용입니다.",
    });
});

// 12. [4.2 요구사항] 제목 0자·121자는 저장되지 않음
test("does NOT save when title length is 0 or 121 characters", () => {
    const onSubmit = jest.fn();
    const { rerender } = render(<QnaPage status="success" view="create" onSubmit={onSubmit} />);
    // 제목 0자 (공백)
    userEvent.type(screen.getByRole("textbox", { name: "본문" }), "내용입니다.");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(onSubmit).not.toHaveBeenCalled();

    onSubmit.mockClear();
    // 제목 121자
    rerender(<QnaPage status="success" view="create" onSubmit={onSubmit} />);
    const title121 = "a".repeat(121);
    userEvent.type(screen.getByRole("textbox", { name: "제목" }), title121);
    userEvent.type(screen.getByRole("textbox", { name: "본문" }), "내용입니다.");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("제목은 1자 이상 120자 이하로 입력해 주세요.")).toBeInTheDocument();
});


// 13-1. [4.3 요구사항] 본문 1자는 저장됨
test("saves when body length is 1 character", () => {
    const onSubmit = jest.fn();

    render(
        <QnaPage
            status="success"
            view="create"
            onSubmit={onSubmit}
        />
    );

    userEvent.type(
        screen.getByRole("textbox", { name: "제목" }),
        "제목입니다."
    );

    userEvent.type(
        screen.getByRole("textbox", { name: "본문" }),
        "B"
    );

    fireEvent.click(
        screen.getByRole("button", { name: "등록" })
    );

    expect(onSubmit).toHaveBeenCalledWith({
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "제목입니다.",
        body: "B",
    });
});

// 13-2. [4.3 요구사항] 본문 5000자는 저장됨
test("saves when body length is 5000 characters", () => {
    const onSubmit = jest.fn();

    render(
        <QnaPage
            status="success"
            view="create"
            onSubmit={onSubmit}
        />
    );

    const body5000 = "c".repeat(5000);

    userEvent.type(
        screen.getByRole("textbox", { name: "제목" }),
        "제목입니다."
    );

    // 5,000자 대용량 입력은 fireEvent.change로 한 번에 주입!
    fireEvent.change(screen.getByRole("textbox", { name: "본문" }), {
        target: { value: body5000 },
    });

    fireEvent.click(
        screen.getByRole("button", { name: "등록" })
    );

    expect(onSubmit).toHaveBeenCalledWith({
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "제목입니다.",
        body: body5000,
    });
});

// 14. [4.4 요구사항] 본문 0자·5001자는 저장되지 않음
test("does NOT save when body length is 0 or 5001 characters", () => {
    const onSubmit = jest.fn();
    const { rerender } = render(<QnaPage status="success" view="create" onSubmit={onSubmit} />);
    // 1) 본문 0자 (빈값 제출)
    fireEvent.change(screen.getByRole("textbox", { name: "제목" }), { target: { value: "제목입니다." } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("본문은 1자 이상 5000자 이하로 입력해 주세요.")).toBeInTheDocument();
    onSubmit.mockClear();
    // 2) 본문 5001자 (초과 제출)
    rerender(<QnaPage status="success" view="create" onSubmit={onSubmit} />);
    const body5001 = "b".repeat(5001);
    fireEvent.change(screen.getByRole("textbox", { name: "제목" }), { target: { value: "제목입니다." } });
    fireEvent.change(screen.getByRole("textbox", { name: "본문" }), { target: { value: body5001 } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("본문은 1자 이상 5000자 이하로 입력해 주세요.")).toBeInTheDocument();
});

// 15. [4.5 요구사항] 잘못된 입력에서는 onSubmit과 onEdit이 호출되지 않음
test("does NOT call onSubmit or onEdit on invalid input", () => {
    const onSubmit = jest.fn();
    const onEdit = jest.fn();
    const { rerender } = render(<QnaPage status="success" view="create" onSubmit={onSubmit} onEdit={onEdit} />);
    // 잘못된 작성 제출
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
        screen.getByText("제목은 1자 이상 120자 이하로 입력해 주세요.")
    ).toBeInTheDocument();

    onSubmit.mockClear();

    // 잘못된 수정 제출
    const selectedQuestion = {
        id: "qna-1",
        authorId: "user-123",
        status: "OPEN",
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "",
        body: "정상적인 본문"
    };

    rerender(
        <QnaPage
            status="success"
            view="edit"
            selectedQuestion={selectedQuestion}
            currentUser={{ id: "user-123", name: "따릉이유저" }}
            onSubmit={onSubmit}
            onEdit={onEdit}
        />
    );

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(
        screen.getByText("제목은 1자 이상 120자 이하로 입력해 주세요.")
    ).toBeInTheDocument();
});

// 16. [4.6 요구사항] 올바른 수정 화면에서는 onEdit에 category, visibility, title, body가 전달됨
test("passes category, visibility, title, body to onEdit on valid edit", () => {
    const onEdit = jest.fn();
    const currentUser = { id: "user-123", name: "따릉이유저" };
    const selectedQuestion = {
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "수정 전 제목",
        body: "수정 전 본문",
        authorId: "user-123",
        status: "OPEN",
    };
    render(<QnaPage status="success" view="edit" selectedQuestion={selectedQuestion} currentUser={currentUser} onEdit={onEdit} />);
    const titleInput = screen.getByRole("textbox", { name: "제목" });
    userEvent.clear(titleInput);
    userEvent.type(titleInput, "수정 후 제목");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onEdit).toHaveBeenCalledWith({
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "수정 후 제목",
        body: "수정 전 본문",
    });
});

// 17. [5번 요구사항] 타인의 질문으로 view="edit" 직접 진입 시 차단됨
test("blocks edit form access for other users questions in view=edit", () => {
    const onEdit = jest.fn();
    const currentUser = { id: "user-123", name: "따릉이유저" };
    const otherQuestion = {
        id: "qna-99",
        authorId: "user-456", // 타인 작성자
        status: "OPEN",
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "타인 질문",
        body: "타인 본문",
    };
    render(
        <QnaPage
            status="success"
            view="edit"
            selectedQuestion={otherQuestion}
            currentUser={currentUser}
            onEdit={onEdit}
        />
    );
    expect(screen.getByText("접근 권한이 없거나 수정할 수 없는 질문입니다")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "제목" })).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
});
// 18. [5번 요구사항] 답변 완료된 질문으로 view="edit" 직접 진입 시 차단됨
test("blocks edit form access for answered questions in view=edit", () => {
    const onEdit = jest.fn();
    const currentUser = { id: "user-123", name: "따릉이유저" };
    const answeredQuestion = {
        id: "qna-1",
        authorId: "user-123", // 본인 작성자
        status: "ANSWERED", // 답변 완료됨!
        category: "GENERAL",
        visibility: "PUBLIC",
        title: "답변완료 질문",
        body: "답변완료 본문",
    };
    render(
        <QnaPage
            status="success"
            view="edit"
            selectedQuestion={answeredQuestion}
            currentUser={currentUser}
            onEdit={onEdit}
        />
    );
    expect(screen.getByText("접근 권한이 없거나 수정할 수 없는 질문입니다")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "제목" })).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
});
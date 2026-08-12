import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QnaPage from "./QnaPage";
import { qnaFixture } from "./data/qnaFixture";

// 1. 검색 및 PUBLIC 질문 노출 검증
test("shows searchable public questions", () => {
    const onSearch = jest.fn();
    render(
        <QnaPage
            status="success"
            view="list"
            questions={qnaFixture}
            onSearch={onSearch}
        />
    );
    // 질문 목록 렌더링 확인
    expect(screen.getByText("예측은 예약을 보장하나요?")).toBeInTheDocument();
    // PUBLIC 질문은 "공개"로 표시된다.
    // '비공개'가 아닌 오직 단독/독립된 '공개'만 매칭하는 부정 탐색 정규식!
    expect(screen.getAllByText(/(?<!비)공개/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/비공개/)[0]).toBeInTheDocument();
    // 검색어 입력 및 검색 버튼 클릭
    const searchInput = screen.getByRole("textbox", { name: "검색어 입력" });
    userEvent.type(searchInput, "예측");
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(onSearch).toHaveBeenCalledWith({ query: "예측", category: "ALL" });
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
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AsyncState,
  ConsumerAppHeader,
  ConsumerButton,
  ConsumerGrid,
  ConsumerIcon,
  ConsumerR2Theme,
  FormField,
  MapShell,
  OptionCard,
  SelectedPlaceCard,
  StatusBadge,
  SurfaceCard,
} from "./index";

test("header uses semantic navigation and preserves callback-based SPA routing", () => {
  const onNavigate = jest.fn();
  const onLogin = jest.fn();
  render(
    <ConsumerR2Theme>
      <ConsumerAppHeader activeItem="ride" hasUnreadNotifications onNavigate={onNavigate} onLogin={onLogin} />
      <main id="main-content">본문</main>
    </ConsumerR2Theme>,
  );

  expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "라이딩" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("img", { name: "따라가요" })).toHaveAttribute("fetchpriority", "high");
  expect(screen.getByRole("link", { name: "본문 바로가기" })).toHaveAttribute("href", "#main-content");
  expect(document.querySelector("#main-content")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "AI 플래너 PREMIUM" }));
  fireEvent.click(screen.getByRole("link", { name: "로그인" }));
  expect(onNavigate).toHaveBeenCalledWith("planner");
  expect(onLogin).toHaveBeenCalledTimes(1);
});

test("unwired future navigation stays inert while current hash routes remain truthful", () => {
  render(<ConsumerR2Theme><ConsumerAppHeader /></ConsumerR2Theme>);

  expect(screen.getByRole("button", { name: "내 주변" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "라이딩" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "AI 플래너 PREMIUM" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "보관함" })).toHaveAttribute("href", "#archive");
  expect(screen.getByRole("link", { name: "Q&A" })).toHaveAttribute("href", "#qna");
});

test("authenticated header exposes account and premium state without changing navigation semantics", () => {
  const onAccount = jest.fn();
  render(
    <ConsumerR2Theme>
      <ConsumerAppHeader authState="authenticated" userName="홍길동님" userTier="premium" onAccount={onAccount} />
    </ConsumerR2Theme>,
  );

  fireEvent.click(screen.getByRole("link", { name: /홍길동님/ }));
  expect(onAccount).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("PREMIUM")).toHaveLength(2);
});

test("buttons and option cards expose disabled, busy, and selected states", () => {
  const onSelect = jest.fn();
  render(
    <ConsumerR2Theme>
      <ConsumerButton loading>대여 가능성 비교</ConsumerButton>
      <OptionCard title="대중교통" description="예상 이동시간을 반영합니다" selected icon={<ConsumerIcon name="transit" />} onSelect={onSelect} />
    </ConsumerR2Theme>,
  );

  expect(screen.getByRole("button", { name: "처리 중…" })).toBeDisabled();
  const option = screen.getByRole("button", { name: /대중교통/ });
  expect(option).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(option);
  expect(onSelect).toHaveBeenCalledTimes(1);
});

test("form fields connect labels, hints, required state, and errors", () => {
  render(
    <ConsumerR2Theme>
      <FormField id="destination" label="대여 희망 지역" hint="검색 결과에서 선택해 주세요" error="지역을 선택해 주세요" required>
        <input placeholder="장소 검색" />
      </FormField>
    </ConsumerR2Theme>,
  );

  const input = screen.getByLabelText("대여 희망 지역 *");
  expect(input).toBeRequired();
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("검색 결과에서 선택해 주세요 지역을 선택해 주세요");
});

test("form fields ignore invalid children without throwing", () => {
  const { container } = render(
    <ConsumerR2Theme>
      <FormField label="출발 위치">출발 위치</FormField>
    </ConsumerR2Theme>,
  );

  expect(container.querySelector(".cr22-field")).not.toBeInTheDocument();
});

test.each([
  ["loading", "status", "불러오는 중…"],
  ["empty", "status", "표시할 내용이 없습니다"],
  ["error", "alert", "내용을 불러오지 못했습니다"],
  ["partial", "status", "일부 정보만 확인되었습니다"],
])("%s state keeps its factual state and live-region semantics", (state, role, label) => {
  render(<ConsumerR2Theme><AsyncState state={state} /></ConsumerR2Theme>);
  expect(screen.getByRole(role)).toHaveTextContent(label);
});

test("success state renders supplied content without a fallback state", () => {
  render(<ConsumerR2Theme><AsyncState state="success"><p>확인된 결과</p></AsyncState></ConsumerR2Theme>);
  expect(screen.getByText("확인된 결과")).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("error state offers a real retry action", () => {
  const onRetry = jest.fn();
  render(<ConsumerR2Theme><AsyncState state="error" onAction={onRetry} /></ConsumerR2Theme>);
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("place, card, grid, badge, and map primitives accept presentation content without fixture data", () => {
  render(
    <ConsumerR2Theme>
      <ConsumerGrid
        ariaLabel="결과 배치"
        primary={(
          <MapShell
            ariaLabel="후보 지도"
            panel={<span>지도 안내</span>}
            legend={<span>범례</span>}
            controls={<button type="button" aria-label="지도 확대">+</button>}
            footer={<span>지도 하단 정보</span>}
          >
            <div data-testid="provider-map">provider map</div>
          </MapShell>
        )}
        secondary={(
          <SurfaceCard title="선택 정보">
            <SelectedPlaceCard title="선택한 장소" meta="장소 선택 완료" />
            <StatusBadge tone="positive">정상</StatusBadge>
          </SurfaceCard>
        )}
      />
    </ConsumerR2Theme>,
  );

  expect(screen.getByRole("region", { name: "후보 지도" })).toContainElement(screen.getByTestId("provider-map"));
  expect(screen.getByRole("complementary")).toHaveTextContent("선택한 장소");
  expect(screen.getByText("정상")).toHaveClass("cr22-badge--positive");
});

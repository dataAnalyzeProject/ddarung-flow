import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { serviceData, stations } from "./data/mockData";
import Draft1MapFirst from "./drafts/Draft1MapFirst";
import Draft2MapAndList from "./drafts/Draft2MapAndList";
import Draft3SearchFirst from "./drafts/Draft3SearchFirst";
import Draft4Dashboard from "./drafts/Draft4Dashboard";
import Draft5JourneyTimeline from "./drafts/Draft5JourneyTimeline";
import Draft6CardCanvas from "./drafts/Draft6CardCanvas";

const drafts = [Draft1MapFirst, Draft2MapAndList, Draft3SearchFirst, Draft4Dashboard, Draft5JourneyTimeline, Draft6CardCanvas];

describe("메인 화면 시안", () => {
  test.each(drafts.map((Draft, index) => [index + 1, Draft]))("시안 %i가 공통 데이터를 렌더링한다", (_, Draft) => {
    const { container } = render(<Draft />);
    stations.forEach((station) => {
      expect(container).toHaveTextContent(station.name);
      expect(container).toHaveTextContent(station.arrivalTime);
      expect(container).toHaveTextContent(station.availability);
    });
    cleanup();
  });

  test("최종 시안 6에 PC 메인 화면 필수 입력과 로그인 안내가 보인다", () => {
    render(<Draft6CardCanvas />);
    expect(screen.getByPlaceholderText(serviceData.originPlaceholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(serviceData.destinationPlaceholder)).toBeInTheDocument();
    expect(screen.getByDisplayValue(serviceData.expectedTimeValue)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: serviceData.retryButton })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "로그인 필요" }));
    expect(screen.getByText(serviceData.loginNotice)).toBeInTheDocument();
  });

  test("시안 6에서 로그인·복원·결과 없음·오류 상태를 전환한다", () => {
    render(<Draft6CardCanvas />);

    fireEvent.click(screen.getByRole("button", { name: "로그인 필요" }));
    expect(screen.getByText("로그인이 필요합니다")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "로그인 후" }));
    expect(screen.getByText("입력값을 불러왔습니다")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "결과 없음" }));
    expect(screen.getByText(serviceData.noResultNotice)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "오류" }));
    expect(screen.getByText(serviceData.errorNotice)).toBeInTheDocument();
  });
});

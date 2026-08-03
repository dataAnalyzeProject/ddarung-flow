import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByText(serviceData.loginNotice)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: serviceData.predictButton })).toBeInTheDocument();
  });
});

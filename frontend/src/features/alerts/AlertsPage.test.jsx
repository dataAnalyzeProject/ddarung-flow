import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AlertsPage from "./AlertsPage";

const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.restoreAllMocks(); });

test("loads notifications and rules from the API", async () => {
  global.fetch.mockResolvedValueOnce(response([{ id: 1, title: "도착 가능성이 높아요", message: "대여소 알림", readAt: null }]))
    .mockResolvedValueOnce(response([{ id: 2, conditionType: "BIKE_LOW", enabled: true }]));
  render(<AlertsPage />);
  expect(await screen.findByText("도착 가능성이 높아요")).toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "BIKE_LOW" })).toHaveAttribute("aria-checked", "true");
});

test("marks every notification as read through the API", async () => {
  global.fetch.mockResolvedValueOnce(response([{ id: 1, title: "알림", message: "내용", readAt: null }]))
    .mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({ headerName: "X-CSRF-TOKEN", token: "csrf" })).mockResolvedValueOnce(response(null, 204));
  render(<AlertsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "모두 읽음" }));
  await waitFor(() => expect(screen.getByText("읽음")).toBeInTheDocument());
  expect(global.fetch).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/notifications/read-all", expect.objectContaining({ method: "POST" }));
});

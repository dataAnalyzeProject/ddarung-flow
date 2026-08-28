import { render, screen, waitFor } from "@testing-library/react";
import AdminAccessGate from "./AdminAccessGate";
import { getCurrentUser } from "../login/authApi";

jest.mock("../login/authApi", () => ({
  getCurrentUser: jest.fn(),
  logout: jest.fn(),
}));

test("renders a loading state before checking the session", () => {
  getCurrentUser.mockReturnValue(new Promise(() => {}));
  render(<AdminAccessGate />);
  expect(screen.getByTestId("admin-access-loading")).toBeInTheDocument();
});

test.each([
  ["anonymous", { authenticated: false, user: null }, "admin-access-anonymous"],
  ["user", { authenticated: true, user: { role: "USER" } }, "admin-access-forbidden"],
])("does not render admin data for %s", async (_label, response, testId) => {
  getCurrentUser.mockResolvedValue(response);
  render(<AdminAccessGate />);
  expect(await screen.findByTestId(testId)).toBeInTheDocument();
  expect(screen.queryByText("운영 현황")).not.toBeInTheDocument();
});

test("renders the fixture only for ADMIN", async () => {
  const role = "ADMIN";
  getCurrentUser.mockResolvedValue({ authenticated: true, user: { role } });
  render(<AdminAccessGate />);
  expect(await screen.findByRole("heading", { name: "운영 현황" })).toBeInTheDocument();
});

test("renders a retryable error when session lookup fails", async () => {
  getCurrentUser.mockRejectedValue(new Error("network"));
  render(<AdminAccessGate />);
  await waitFor(() => expect(screen.getByTestId("admin-access-error")).toBeInTheDocument());
});

test("renders login guidance when session lookup returns 401", async () => {
  getCurrentUser.mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401 }));
  render(<AdminAccessGate />);
  expect(await screen.findByTestId("admin-access-anonymous")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "로그인으로 이동" })).toHaveAttribute("href", "/login");
});

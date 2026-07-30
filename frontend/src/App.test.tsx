import { render, screen } from "@testing-library/react";
import App from "./App";

test("shows the React learning link", () => {
  render(<App />);
  expect(screen.getByText(/learn react/i)).toBeInTheDocument();
});

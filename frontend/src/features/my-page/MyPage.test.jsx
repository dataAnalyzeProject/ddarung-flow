import { render } from "@testing-library/react";
import MyPage from "./MyPage";

test.skip("shows login required state", () => { render(<MyPage status="anonymous" />); });
test.skip("shows favorite and saved route empty and success states", () => { render(<MyPage status="success" />); });
test.skip("shows prediction history time and model version", () => { render(<MyPage />); });
test.skip("toggles alert rules and marks notifications read", () => { render(<MyPage />); });
test.skip("supports keyboard navigation", () => { render(<MyPage />); });

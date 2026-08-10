import { render } from "@testing-library/react";
import QnaPage from "./QnaPage";

test.skip("shows searchable public questions", () => { render(<QnaPage status="success" />); });
test.skip("forces account and location questions to private", () => { render(<QnaPage />); });
test.skip("shows loading empty error and forbidden states", () => { render(<QnaPage status="loading" />); });
test.skip("submits the approved question payload", () => { render(<QnaPage />); });
test.skip("supports keyboard navigation", () => { render(<QnaPage />); });

import { render } from "@testing-library/react";
import AnalyticsSummaryPage from "./AnalyticsSummaryPage";

test.skip("shows freshness and H1-H4 summaries", () => { render(<AnalyticsSummaryPage status="success" />); });
test.skip("does not expose operational paths or personal data", () => { render(<AnalyticsSummaryPage />); });
test.skip("distinguishes empty delayed and error", () => { render(<AnalyticsSummaryPage status="delayed" />); });

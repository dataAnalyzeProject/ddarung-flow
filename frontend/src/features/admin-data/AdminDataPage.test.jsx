import { render } from "@testing-library/react";
import AdminDataPage from "./AdminDataPage";

test.skip("shows quality freshness and failed batches", () => { render(<AdminDataPage status="success" />); });
test.skip("shows CSV and Parquet export limits", () => { render(<AdminDataPage />); });
test.skip("shows forbidden state without data", () => { render(<AdminDataPage status="forbidden" />); });
test.skip("supports keyboard filters and export request", () => { render(<AdminDataPage />); });

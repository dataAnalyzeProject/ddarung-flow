import { render, screen, waitFor } from "@testing-library/react";
import { AdminPage } from "./AdminPages";
import { listAdminExports } from "./adminExportsApi";
import { getAdminDataQuality } from "./adminDataQualityApi";

jest.mock("./adminExportsApi", () => ({
  listAdminExports: jest.fn(),
  createAdminExport: jest.fn(),
  downloadAdminExport: jest.fn(),
}));
jest.mock("./adminDataQualityApi", () => ({ getAdminDataQuality: jest.fn() }));

beforeEach(() => {
  listAdminExports.mockResolvedValue({ items: [] });
  getAdminDataQuality.mockResolvedValue({
    collection: { expectedStationCount: 4, latestStationCount: 3, missingStationCount: 1, latestCollectedAt: "2026-08-26T11:52:00Z" },
    freshness: { p50DelayMinutes: 4, p95DelayMinutes: 13, status: "NORMAL" },
    inventoryStatusBreakdown: { NORMAL: 2, DELAYED: 0, MISSING: 1, UNAVAILABLE: 0 },
    generatedAt: "2026-08-26T12:04:00Z",
  });
});

test("export page renders data quality separately from zero-bike inventory", async () => {
  render(<AdminPage menuId="export" actorRole="ADMIN" />);
  expect(await screen.findByRole("heading", { name: "데이터 품질 · 신선도 SLO" })).toBeInTheDocument();
  expect(screen.getByText("3 / 4")).toBeInTheDocument();
  expect(screen.getByText("4분 / 13분")).toBeInTheDocument();
  expect(screen.getAllByText("NORMAL").length).toBeGreaterThan(0);
  expect(screen.getByText("누락 대여소 (활성 대여소 중 수집 행 없음)")).toBeInTheDocument();
  expect(screen.getByText("MISSING (수집 행 상태)")).toBeInTheDocument();
  expect(screen.queryByText("2026-08-26T11:52:00Z")).not.toBeInTheDocument();
  await waitFor(() => expect(getAdminDataQuality).toHaveBeenCalled());
});

test("export page keeps its form when data quality cannot be loaded", async () => {
  getAdminDataQuality.mockRejectedValueOnce({ status: 500, code: "INTERNAL_ERROR" });
  render(<AdminPage menuId="export" actorRole="ADMIN" />);
  expect(await screen.findByText("데이터 품질을 불러오지 못했습니다.")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Export 원본" })).toBeInTheDocument();
  expect(screen.queryByText("INTERNAL_ERROR")).not.toBeInTheDocument();
});

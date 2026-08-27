import { render, screen, waitFor } from "@testing-library/react";
import { AdminPage } from "./AdminPages";
import { getAdminPredictionBatches } from "./adminPredictionBatchApi";
import { listAdminModels } from "./adminModelOpsApi";

jest.mock("./adminModelOpsApi", () => ({ listAdminModels: jest.fn(() => Promise.resolve([])), validateAdminModel: jest.fn(), approveAdminModel: jest.fn(), activateAdminModel: jest.fn(), rollbackAdminModel: jest.fn() }));
jest.mock("./adminPredictionBatchApi", () => ({ getAdminPredictionBatches: jest.fn() }));

const activeExpired = {
  batchId: "batch-1", modelVersion: "model", publishStatus: "ACTIVE", featureAsOf: "2026-08-27T02:00:00Z", generatedAt: "2026-08-27T02:01:00Z", publishedAt: "2026-08-27T02:03:34Z", expiresAt: "2026-08-27T06:00:00Z", publishLagSeconds: 154, stationCount: 2718, rowCount: 10872, coverageRatio: 0.9938, horizonCounts: { "60": 2718 }, expired: true
};

function renderBatches(data) {
  listAdminModels.mockResolvedValue([]);
  getAdminPredictionBatches.mockResolvedValue(data);
  render(<AdminPage menuId="modelops" actorRole="ADMIN" />);
}

test("shows prediction batches when the model registry request fails", async () => {
  listAdminModels.mockRejectedValue({ status: 500 });
  getAdminPredictionBatches.mockResolvedValue({ summary: { activeBatchCount: 1, latestPublishLagSeconds: 154, expectedStationCount: 2735 }, batches: [activeExpired] });
  render(<AdminPage menuId="modelops" actorRole="ADMIN" />);
  expect(await screen.findByText("예측 배치 발행")).toBeInTheDocument();
  expect(screen.getByText("ACTIVE · 만료됨")).toBeInTheDocument();
});

test("shows the model registry when the prediction batch request fails", async () => {
  listAdminModels.mockResolvedValue([{ id: 1, version: "model-visible", state: "ACTIVE", createdAt: "2026-08-27" }]);
  getAdminPredictionBatches.mockRejectedValue({ status: 500 });
  render(<AdminPage menuId="modelops" actorRole="ADMIN" />);
  expect((await screen.findAllByText("model-visible")).length).toBeGreaterThan(0);
  expect(screen.getByText("예측 배치 이력을 표시할 수 없습니다.")).toBeInTheDocument();
});

test("shows a factual empty prediction batch state", async () => {
  renderBatches({ summary: { activeBatchCount: 0, expectedStationCount: 0 }, batches: [] });
  expect(await screen.findByText("발행된 예측 배치가 없습니다.")).toBeInTheDocument();
});

test("distinguishes an expired ACTIVE batch and formats timestamps and ratios", async () => {
  renderBatches({ summary: { activeBatchCount: 1, latestPublishLagSeconds: 154, expectedStationCount: 2735 }, batches: [activeExpired] });
  expect(await screen.findByText("ACTIVE · 만료됨")).toBeInTheDocument();
  expect(screen.getByText("2,718 (99.4%)")).toBeInTheDocument();
  expect(screen.queryByText("2026-08-27T02:00:00Z")).not.toBeInTheDocument();
});

test("renders null coverage as a dash", async () => {
  renderBatches({ summary: { activeBatchCount: 0, latestPublishLagSeconds: null, expectedStationCount: 0 }, batches: [{ ...activeExpired, coverageRatio: null, expired: false }] });
  await waitFor(() => expect(screen.getByText("-")).toBeInTheDocument());
});

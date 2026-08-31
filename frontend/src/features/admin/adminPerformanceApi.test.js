import { getAdminPerformanceBase, getAdminPerformanceDiagnostics } from "./adminPerformanceApi";

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

describe("admin performance adapters", () => {
  const originalFetch = global.fetch;

  beforeEach(() => { global.fetch = jest.fn(); });
  afterAll(() => { global.fetch = originalFetch; });

  test("uses source-specific base and diagnostics endpoints", async () => {
    global.fetch.mockResolvedValueOnce(response({ artifactSha256: "base" })).mockResolvedValueOnce(response({ artifactSha256: "a/b" }));

    await getAdminPerformanceBase();
    await getAdminPerformanceDiagnostics("a/b");

    expect(global.fetch).toHaveBeenNthCalledWith(1, "http://localhost:8080/api/v1/admin/model-performance", { credentials: "include" });
    expect(global.fetch).toHaveBeenNthCalledWith(2, "http://localhost:8080/api/v1/admin/model-performance/diagnostics?artifactSha256=a%2Fb", { credentials: "include" });
  });
});

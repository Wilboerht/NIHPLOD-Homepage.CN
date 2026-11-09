import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/admin-reconciliation", () => ({
  runAdminReconciliation: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { verifyAuth } from "@/lib/auth";
import { runAdminReconciliation } from "@/lib/admin-reconciliation";
import { GET } from "@/app/api/admin/reconciliation/route";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function request(query = "") {
  return new NextRequest(`http://localhost/api/admin/reconciliation${query}`, { method: "GET" });
}

describe("admin reconciliation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    vi.mocked(runAdminReconciliation).mockResolvedValue({
      generatedAt: "2026-11-08T00:00:00.000Z",
    } as never);
  });

  it("未登录返回 401", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(runAdminReconciliation).not.toHaveBeenCalled();
  });

  it("无对账权限返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ ...OWNER, role: "hr" } as never);
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(runAdminReconciliation).not.toHaveBeenCalled();
  });

  it("默认参数执行全量巡检", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(runAdminReconciliation).toHaveBeenCalledWith({ limit: 100, sinceDays: 90 });
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });

  it("透传 limit 与 sinceDays", async () => {
    const response = await GET(request("?limit=50&sinceDays=30"));
    expect(response.status).toBe(200);
    expect(runAdminReconciliation).toHaveBeenCalledWith({ limit: 50, sinceDays: 30 });
  });

  it("非法参数返回 400", async () => {
    const response = await GET(request("?limit=0"));
    expect(response.status).toBe(400);
    expect(runAdminReconciliation).not.toHaveBeenCalled();
  });
});

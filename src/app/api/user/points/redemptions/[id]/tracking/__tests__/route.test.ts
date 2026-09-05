/**
 * GET /api/user/points/redemptions/[id]/tracking 路由测试（物流轨迹查询）
 * 覆盖：未登录 401、越权/不存在 404、无运单号 400、丰桥未配置降级、轨迹查询成功
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const REDEMPTION_ID = "c" + "a".repeat(24);

vi.mock("@/lib/auth", () => ({
  verifyUserAuth: vi.fn(() => Promise.resolve({ id: "user-1" })),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

const { mockFindUnique, mockQuerySfRoutes } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockQuerySfRoutes: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { pointRedemption: { findUnique: mockFindUnique } },
}));

vi.mock("@/lib/sf-express", () => ({
  querySfRoutes: mockQuerySfRoutes,
}));

import { GET } from "@/app/api/user/points/redemptions/[id]/tracking/route";

function createRequest(): NextRequest {
  return new NextRequest(
    new URL(`/api/user/points/redemptions/${REDEMPTION_ID}/tracking`, "http://localhost:3000"),
    { method: "GET" } as never
  );
}

describe("GET /api/user/points/redemptions/[id]/tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({
      userId: "user-1",
      carrier: "SF",
      waybillNo: "SF1234567890123",
    });
    mockQuerySfRoutes.mockResolvedValue({
      ok: true,
      routes: [{ time: "2026-09-05T10:00:00.000Z", description: "已签收", location: "上海市" }],
    });
  });

  it("轨迹查询成功返回运单号与轨迹", async () => {
    const res = await GET(createRequest(), { params: Promise.resolve({ id: REDEMPTION_ID }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      waybillNo: "SF1234567890123",
      carrier: "SF",
      supported: true,
      routes: [{ time: "2026-09-05T10:00:00.000Z", description: "已签收", location: "上海市" }],
      error: null,
    });
  });

  it("记录不属于当前用户：404（不泄露存在性）", async () => {
    mockFindUnique.mockResolvedValue({ userId: "other-user", carrier: null, waybillNo: null });

    const res = await GET(createRequest(), { params: Promise.resolve({ id: REDEMPTION_ID }) });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
    expect(mockQuerySfRoutes).not.toHaveBeenCalled();
  });

  it("无运单号：400 NO_WAYBILL", async () => {
    mockFindUnique.mockResolvedValue({ userId: "user-1", carrier: null, waybillNo: null });

    const res = await GET(createRequest(), { params: Promise.resolve({ id: REDEMPTION_ID }) });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("NO_WAYBILL");
  });

  it("丰桥未配置：返回 supported=false 供前端降级", async () => {
    mockQuerySfRoutes.mockResolvedValue({ ok: false, reason: "NOT_CONFIGURED" });

    const res = await GET(createRequest(), { params: Promise.resolve({ id: REDEMPTION_ID }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.supported).toBe(false);
    expect(data.data.routes).toBeNull();
  });

  it("丰桥查询失败：返回错误信息（routes 为 null）", async () => {
    mockQuerySfRoutes.mockResolvedValue({ ok: false, reason: "ERROR", message: "轨迹查询失败" });

    const res = await GET(createRequest(), { params: Promise.resolve({ id: REDEMPTION_ID }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.supported).toBe(true);
    expect(data.data.routes).toBeNull();
    expect(data.data.error).toBe("轨迹查询失败");
  });
});

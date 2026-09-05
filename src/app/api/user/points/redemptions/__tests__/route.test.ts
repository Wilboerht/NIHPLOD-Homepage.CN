/**
 * GET /api/user/points/redemptions 路由测试（兑换记录无限滚动分页）
 * 覆盖：默认第一页、hasMore 判断（多取 1 条）、offset 分页、非法 offset 400
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) =>
    (req: NextRequest) =>
      handler(req, { id: "user-1" }),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { pointRedemption: { findMany: mockFindMany } },
}));

import { GET } from "@/app/api/user/points/redemptions/route";

function createRequest(offset?: string): NextRequest {
  const url = new URL(
    offset === undefined ? "/api/user/points/redemptions" : `/api/user/points/redemptions?offset=${offset}`,
    "http://localhost:3000"
  );
  return new NextRequest(url, { method: "GET" } as never);
}

function redemptionRow(id: string) {
  return {
    id,
    productName: "洁面乳",
    priceYuan: { toNumber: () => 199 } as never,
    points: 153,
    status: "PENDING",
    recipient: "张三",
    phone: "13800138000",
    address: "上海市 浦东新区 世纪大道 100 号",
    createdAt: new Date("2026-09-03T10:00:00.000Z"),
  };
}

describe("GET /api/user/points/redemptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  it("默认第一页：按用户过滤、倒序、取 11 条判断 hasMore", async () => {
    mockFindMany.mockResolvedValue([redemptionRow("r1")]);

    const res = await GET(createRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 11,
      })
    );
    expect(data.data.redemptions).toHaveLength(1);
    expect(data.data.hasMore).toBe(false);
  });

  it("超过 10 条时 hasMore 为 true 且只返回 10 条", async () => {
    mockFindMany.mockResolvedValue(Array.from({ length: 11 }, (_, i) => redemptionRow(`r${i}`)));

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.data.redemptions).toHaveLength(10);
    expect(data.data.hasMore).toBe(true);
  });

  it("offset 分页：跳过已加载条数", async () => {
    mockFindMany.mockResolvedValue([redemptionRow("r11")]);

    const res = await GET(createRequest("10"));

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 11 })
    );
  });

  it("非法 offset 应返回 400 INVALID_PARAMS", async () => {
    const res = await GET(createRequest("abc"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("INVALID_PARAMS");
  });
});

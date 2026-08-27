/**
 * 积分变动历史路由测试
 * GET /api/user/points/history
 *
 * 覆盖（B3 整改：补 EXTERNAL_SYNC 标签）：
 * - EXTERNAL_SYNC 类型返回「商城同步」标签
 * - type=EXTERNAL_SYNC 过滤参数放行
 * - 未知类型不过滤、无标签时回退原始 type
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock Prisma ===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pointTransaction: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// === Mock auth（直接以测试用户身份执行 handler） ===
vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, user: { id: string }) => Promise<Response>) =>
    (req: NextRequest) =>
      handler(req, { id: "user-1" }),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from "../route";
import { prisma } from "@/lib/prisma";

function createRequest(query = "") {
  return new NextRequest(`http://localhost/api/user/points/history${query}`);
}

describe("GET /api/user/points/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.pointTransaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
  });

  it("EXTERNAL_SYNC 类型应返回「商城同步」标签", async () => {
    (prisma.pointTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "pt-1",
        points: 500,
        type: "EXTERNAL_SYNC",
        reference: "ORDER-123",
        note: "商城订单同步",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    ]);

    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.transactions[0].typeLabel).toBe("商城同步");
  });

  it("type=EXTERNAL_SYNC 过滤参数应放行并传入查询条件", async () => {
    (prisma.pointTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(createRequest("?type=EXTERNAL_SYNC"));
    expect(res.status).toBe(200);
    expect(prisma.pointTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", type: "EXTERNAL_SYNC" }),
      })
    );
  });

  it("未知 type 不参与过滤，无标签类型回退原始 type", async () => {
    (prisma.pointTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "pt-2",
        points: 10,
        type: "SOME_LEGACY_TYPE",
        reference: null,
        note: null,
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    ]);

    const res = await GET(createRequest("?type=UNKNOWN_TYPE"));
    const body = await res.json();

    expect(res.status).toBe(200);
    // 未知 type 不传入 where
    const where = (prisma.pointTransaction.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
      .where;
    expect(where).not.toHaveProperty("type");
    // 无标签类型回退原始 type 字符串
    expect(body.data.transactions[0].typeLabel).toBe("SOME_LEGACY_TYPE");
  });
});

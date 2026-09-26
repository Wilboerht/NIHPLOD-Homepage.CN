/**
 * 护肤档案 BFF 路由测试（主站用户中心 → 子站内部接口代理）
 * 覆盖：路径/参数映射、透传、子站失败时 502 契约错误。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  advisorRequest: vi.fn(),
  grantCheckinPoints: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) =>
    (req: NextRequest) =>
      handler(req, { id: "user-1" }),
}));

vi.mock("@/lib/advisor-internal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/advisor-internal")>();
  return {
    ...actual,
    advisorRequest: mocks.advisorRequest,
    // 客户端 IP 解析固定返回，断言 clientIp 透传
    resolveClientIp: () => "9.9.9.9",
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => unknown) => cb({ __tx: true }),
  },
}));

vi.mock("@/lib/points-ledger", () => ({
  grantCheckinPoints: mocks.grantCheckinPoints,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: mocks.error, warn: mocks.warn, info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { DELETE, GET as archiveGet, POST } from "@/app/api/user/skincare-archive/route";
import { GET as trendsGet } from "@/app/api/user/skincare-trends/route";
import { GET as testsGet } from "@/app/api/user/skincare-tests/route";

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), { method: "GET" } as never);
}

function createPostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.advisorRequest.mockResolvedValue({ ok: true, status: 200, data: { success: true, data: [] } });
  mocks.grantCheckinPoints.mockResolvedValue({ duplicated: false, amount: 2 });
});

describe("GET /api/user/skincare-archive", () => {
  it("bootstrap=1 走 archive，其余走 list，参数透传 userId 与用户真实 IP", async () => {
    await archiveGet(createRequest("/api/user/skincare-archive?bootstrap=1&limit=30"));
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/diary/archive",
      expect.objectContaining({
        query: expect.objectContaining({ userId: "user-1", limit: "30", clientIp: "9.9.9.9" }),
      })
    );

    mocks.advisorRequest.mockClear();
    await archiveGet(createRequest("/api/user/skincare-archive?before=2026-01-01"));
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/diary",
      expect.objectContaining({
        query: expect.objectContaining({ userId: "user-1", before: "2026-01-01" }),
      })
    );
  });

  it("透传子站响应体", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: [{ id: "e1" }], summary: { totalCheckins: 1 } },
    });
    const res = await archiveGet(createRequest("/api/user/skincare-archive?bootstrap=1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, data: [{ id: "e1" }] });
  });

  it("子站失败返回 502 契约错误", async () => {
    mocks.advisorRequest.mockResolvedValue({ ok: false, status: 0, code: "UPSTREAM_ERROR", message: "子站服务连接失败" });
    const res = await archiveGet(createRequest("/api/user/skincare-archive?bootstrap=1"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: { code: "UPSTREAM_ERROR", message: "子站服务连接失败" },
    });
  });

  it("子站限流 429 精确映射为 429 RATE_LIMITED（不再折叠成 502）", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: false,
      status: 429,
      code: "UPSTREAM_ERROR",
      message: "请求过于频繁，请稍后再试",
    });
    const res = await archiveGet(createRequest("/api/user/skincare-archive?bootstrap=1"));
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" },
    });
  });
});

describe("POST /api/user/skincare-archive（打卡 + 官网直发积分）", () => {
  const upsertUpstream = {
    ok: true,
    status: 200,
    data: {
      success: true,
      data: {
        id: "e1",
        date: "2026-09-24T00:00:00.000Z",
        skinState: "good",
        tags: ["熬夜"],
        note: null,
      },
      isFirstManualCheckin: true,
      streak: 2,
      points: 2,
    },
  };

  it("首次手动打卡：写入子站后官网账本直发，reference 与子站口径一致", async () => {
    mocks.advisorRequest.mockResolvedValue(upsertUpstream);

    const res = await POST(
      createPostRequest("/api/user/skincare-archive", { date: "2026-09-24", skinState: "good" })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      data: { id: "e1" },
      points: { granted: 2, streak: 2 },
    });
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/diary",
      expect.objectContaining({
        method: "POST",
        query: { userId: "user-1" },
        body: { date: "2026-09-24", skinState: "good" },
      })
    );
    expect(mocks.grantCheckinPoints).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: "user-1",
        amount: 2,
        reference: "checkin:user-1:2026-09-24",
        note: "连续第 2 天",
      }
    );
  });

  it("账本已存在同 reference（duplicated）：打卡成功但不返回 points", async () => {
    mocks.advisorRequest.mockResolvedValue(upsertUpstream);
    mocks.grantCheckinPoints.mockResolvedValue({ duplicated: true, amount: 0 });

    const res = await POST(
      createPostRequest("/api/user/skincare-archive", { date: "2026-09-24", skinState: "good" })
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.points).toBeUndefined();
  });

  it("积分发放异常不阻断打卡（静默降级）", async () => {
    mocks.advisorRequest.mockResolvedValue(upsertUpstream);
    mocks.grantCheckinPoints.mockRejectedValue(new Error("ledger down"));

    const res = await POST(
      createPostRequest("/api/user/skincare-archive", { date: "2026-09-24", skinState: "good" })
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.points).toBeUndefined();
    expect(mocks.error).toHaveBeenCalled();
  });

  it("子站 400（输入校验失败）原样返回 400", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: false,
      status: 400,
      code: "UPSTREAM_ERROR",
      message: "肌肤状态不合法",
    });
    const res = await POST(
      createPostRequest("/api/user/skincare-archive", { date: "2026-09-24", skinState: "bad-value" })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "INVALID_PARAMS", message: "肌肤状态不合法" },
    });
    expect(mocks.grantCheckinPoints).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/user/skincare-archive", () => {
  it("代理子站删除并透传删除条数", async () => {
    mocks.advisorRequest.mockResolvedValue({ ok: true, status: 200, data: { success: true, deleted: 1 } });
    const res = await DELETE(createRequest("/api/user/skincare-archive?date=2026-09-24"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, deleted: 1 });
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/diary",
      expect.objectContaining({ method: "DELETE", query: { userId: "user-1", date: "2026-09-24" } })
    );
  });
});

describe("GET /api/user/skincare-trends 与 /skincare-tests", () => {
  it("趋势：代理 /api/internal/skin-trends 并透传", async () => {
    mocks.advisorRequest.mockResolvedValue({ ok: true, status: 200, data: { success: true, data: null } });
    const res = await trendsGet(createRequest("/api/user/skincare-trends"));
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/skin-trends",
      expect.objectContaining({ query: { userId: "user-1", clientIp: "9.9.9.9" } })
    );
    await expect(res.json()).resolves.toEqual({ success: true, data: null });
  });

  it("测肤记录：代理 /api/internal/test-history，lite/page 与 clientIp 透传", async () => {
    mocks.advisorRequest.mockResolvedValue({ ok: true, status: 200, data: { history: [], pagination: { total: 0 } } });
    const res = await testsGet(createRequest("/api/user/skincare-tests?page=2&limit=50&lite=1"));
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/test-history",
      expect.objectContaining({
        query: expect.objectContaining({
          userId: "user-1",
          page: "2",
          limit: "50",
          lite: "1",
          clientIp: "9.9.9.9",
        }),
      })
    );
    await expect(res.json()).resolves.toMatchObject({ history: [] });
  });

  it("测肤记录：子站失败返回 502", async () => {
    mocks.advisorRequest.mockResolvedValue({ ok: false, status: 502, code: "UPSTREAM_ERROR", message: "子站服务暂时不可用" });
    const res = await testsGet(createRequest("/api/user/skincare-tests"));
    expect(res.status).toBe(502);
  });
});

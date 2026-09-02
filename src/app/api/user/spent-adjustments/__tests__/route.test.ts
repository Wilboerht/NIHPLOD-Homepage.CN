/**
 * 消费补录申请 API 测试（用户端）
 * GET  /api/user/spent-adjustments - 列表
 * POST /api/user/spent-adjustments - 提交（校验、待审上限、订单号重复、未来日期、限流）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => {
  const m = {
    spentAdjustmentApplication: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    // 事务透传：直接以 mock 自身作为 tx 执行回调
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(m)),
  };
  return m;
});

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) =>
    (req: NextRequest) =>
      handler(req, { id: "user-1" }),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

import { rateLimit } from "@/lib/ratelimit";
import { GET, POST } from "@/app/api/user/spent-adjustments/route";

const mockFindMany = prismaMock.spentAdjustmentApplication.findMany as ReturnType<typeof vi.fn>;
const mockCount = prismaMock.spentAdjustmentApplication.count as ReturnType<typeof vi.fn>;
const mockCreate = prismaMock.spentAdjustmentApplication.create as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;

function createRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest(new URL("/api/user/spent-adjustments", "http://localhost:3000"), {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  } as never);
}

describe("GET /api/user/spent-adjustments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
  });

  it("返回当前用户的申请列表", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "app-1",
        channel: "TMALL",
        orderNo: "ORDER123",
        amountClaimed: 1000,
        purchasedAt: null,
        images: [],
        note: null,
        status: "PENDING",
        reviewAmount: null,
        reviewNote: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
        reviewedAt: null,
      },
    ]);

    const res = await GET(createRequest("GET"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.applications).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
  });
});

describe("POST /api/user/spent-adjustments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue({
      id: "app-new",
      status: "PENDING",
    });
  });

  it("最小提交（仅渠道 + 订单号）成功，并在事务内做待审上限校验", async () => {
    const res = await POST(createRequest("POST", { channel: "TMALL", orderNo: "ORDER123" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        channel: "TMALL",
        orderNo: "ORDER123",
        images: [],
      }),
    });
  });

  it("非法渠道返回 400", async () => {
    const res = await POST(createRequest("POST", { channel: "TAOBAO", orderNo: "ORDER123" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("INVALID_PARAMS");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("缺少订单号返回 400", async () => {
    const res = await POST(createRequest("POST", { channel: "TMALL", orderNo: "  " }));
    expect(res.status).toBe(400);
  });

  it("未来消费日期返回 400", async () => {
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const res = await POST(
      createRequest("POST", { channel: "JD", orderNo: "JD456", purchasedAt: future })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("INVALID_PARAMS");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("待审申请达到上限返回 PENDING_LIMIT", async () => {
    mockCount.mockResolvedValue(2);

    const res = await POST(createRequest("POST", { channel: "JD", orderNo: "JD456" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("PENDING_LIMIT");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("订单号与待审/已通过申请冲突（P2002）返回 409", async () => {
    mockCreate.mockRejectedValue({ code: "P2002" });

    const res = await POST(createRequest("POST", { channel: "TMALL", orderNo: "ORDER123" }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error.code).toBe("ORDER_NO_DUPLICATE");
  });

  it("凭证截图超过 3 张返回 400", async () => {
    const res = await POST(
      createRequest("POST", {
        channel: "OFFLINE",
        orderNo: "RCPT-1",
        images: ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg", "https://x/4.jpg"],
      })
    );
    expect(res.status).toBe(400);
  });

  it("本地存储模式的相对路径图片 URL 可正常提交", async () => {
    const res = await POST(
      createRequest("POST", {
        channel: "OFFLINE",
        orderNo: "RCPT-2",
        images: ["/uploads/spent-adjustments/abc.webp"],
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ images: ["/uploads/spent-adjustments/abc.webp"] }),
    });
  });

  it("非法图片地址（非 URL 非站内路径）返回 400", async () => {
    const res = await POST(
      createRequest("POST", {
        channel: "JD",
        orderNo: "JD789",
        images: ["javascript:alert(1)"],
      })
    );
    expect(res.status).toBe(400);
  });

  it("提交限流触发返回 429", async () => {
    mockRateLimit.mockResolvedValue({ success: false });

    const res = await POST(createRequest("POST", { channel: "TMALL", orderNo: "ORDER123" }));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error.code).toBe("RATE_LIMITED");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

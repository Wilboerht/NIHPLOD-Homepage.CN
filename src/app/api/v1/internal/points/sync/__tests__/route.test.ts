/**
 * POST /api/v1/internal/points/sync 路由测试（2026-09 起仅同步消费额）
 * 覆盖：缺鉴权头 401、签名错误 401、参数校验 400（spentDelta 绝对值上限）、
 *       用户不存在 404、成功入账（含等级重算）、CAS 并发重试、
 *       重复上报幂等（已存在记录 / P2002 → duplicated）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { txClient } = vi.hoisted(() => ({
  txClient: {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    spentSyncRecord: { findUnique: vi.fn(), create: vi.fn() },
    pointLedger: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pointBalance: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    tokenBlacklist: { create: vi.fn().mockResolvedValue({}) },
    // 事务 mock：直接以 txClient 执行回调
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
  },
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(),
  getClientIP: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { generateInternalApiSignature, hashRequestBody } from "@/lib/internal-api";
import { POST } from "@/app/api/v1/internal/points/sync/route";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockUserFindUnique = (prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> })
  .findUnique;

const PATH = "/api/v1/internal/points/sync";
const KEY = "mall-key";
const SECRET = "mall-secret";

let nonceCounter = 0;

/** 构造带合法签名的请求（与商城侧签名算法一致） */
function createSignedRequest(body: unknown, options?: { badSignature?: boolean }): NextRequest {
  const bodyText = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = `test-nonce-${++nonceCounter}`;
  const bodyHash = hashRequestBody(bodyText);
  let signature = generateInternalApiSignature(SECRET, "POST", PATH, timestamp, nonce, bodyHash);
  if (options?.badSignature) {
    signature = signature.replace(/.$/, signature.endsWith("0") ? "1" : "0");
  }

  return new NextRequest(new URL(PATH, "http://localhost:3000"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": KEY,
      "x-internal-api-signature": signature,
      "x-internal-api-timestamp": String(timestamp),
      "x-internal-api-nonce": nonce,
    },
    body: bodyText,
  } as never);
}

const VALID_BODY = {
  phone: "13800138000",
  spentDelta: 150,
  reference: "mall-order-N001",
  note: "商城订单消费",
};

describe("POST /api/v1/internal/points/sync（消费额同步）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEYS = JSON.stringify([{ project: "mall", key: KEY, secret: SECRET }]);
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
    // 默认：幂等记录不存在、CAS 条件更新命中
    txClient.spentSyncRecord.findUnique.mockResolvedValue(null);
    txClient.spentSyncRecord.create.mockResolvedValue({});
    txClient.user.updateMany.mockResolvedValue({ count: 1 });
    // 积分联动默认 mock
    txClient.pointLedger.findUnique.mockResolvedValue(null);
    txClient.pointLedger.findMany.mockResolvedValue([]);
    txClient.pointLedger.create.mockResolvedValue({});
    txClient.pointBalance.upsert.mockResolvedValue({});
  });

  it("缺少鉴权头应返回 401 MISSING_AUTH", async () => {
    const req = new NextRequest(new URL(PATH, "http://localhost:3000"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    } as never);

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("MISSING_AUTH");
  });

  it("签名错误应返回 401 UNAUTHORIZED", async () => {
    const res = await POST(createSignedRequest(VALID_BODY, { badSignature: true }));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("spentDelta 超出绝对值上限（±1,000,000）应返回 400 INVALID_PARAMS", async () => {
    const res = await POST(createSignedRequest({ ...VALID_BODY, spentDelta: -1_000_001 }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("手机号格式非法应返回 400 INVALID_PARAMS", async () => {
    const res = await POST(createSignedRequest({ ...VALID_BODY, phone: "12345" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("缺少 reference 应返回 400 INVALID_PARAMS", async () => {
    const body = { ...VALID_BODY } as Record<string, unknown>;
    delete body.reference;

    const res = await POST(createSignedRequest(body));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("用户不存在应返回 404 USER_NOT_FOUND", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(createSignedRequest(VALID_BODY));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("USER_NOT_FOUND");
  });

  it("成功入账：CAS 更新消费额、写幂等记录并按新消费额重算等级", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    txClient.user.findUnique.mockResolvedValue({
      totalSpent: 850,
    });

    const res = await POST(createSignedRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // 850 + 150 = 1000 ≥ 1000 → 升级银卡会员
    expect(data.data).toEqual({
      totalSpent: 1000,
      membershipLevel: "SILVER",
    });
    // CAS 乐观并发控制：以读取快照作为更新条件；首次达档写入激活日
    expect(txClient.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", totalSpent: 850 },
      data: { totalSpent: 1000, membershipLevel: "SILVER", silverActivatedAt: expect.any(Date) },
    });
    expect(txClient.spentSyncRecord.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        reference: "mall-order-N001",
        spentDelta: 150,
        note: "商城订单消费",
      },
    });
    // 积分联动：消费发放 1:1（立即到账、6 个月过期）
    expect(txClient.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "CONSUME",
        amount: 150,
        remaining: 150,
        reference: "points:mall-order-N001",
        releasedAt: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    });
    expect(txClient.pointBalance.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1", available: 150 },
      update: { available: { increment: 150 } },
    });
  });

  it("普通档消费（未达银卡门槛）：同样发放积分（仅累积，不可兑礼）", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    // 500 + 400 = 900 < 1000，仍为普通档
    txClient.user.findUnique.mockResolvedValue({ totalSpent: 500 });

    const res = await POST(
      createSignedRequest({ ...VALID_BODY, spentDelta: 400, reference: "mall-order-N3" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.membershipLevel).toBe("REGULAR");
    // 普通档同样 1:1 发放积分（立即到账、6 个月过期）
    expect(txClient.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "CONSUME",
        amount: 400,
        remaining: 400,
        reference: "points:mall-order-N3",
        releasedAt: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    });
    expect(txClient.pointBalance.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1", available: 400 },
      update: { available: { increment: 400 } },
    });
  });

  it("退款扣减（负 spentDelta）应钳制到 0，不出现负消费额", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    txClient.user.findUnique.mockResolvedValue({
      totalSpent: 50,
    });

    const res = await POST(
      createSignedRequest({ ...VALID_BODY, spentDelta: -100, reference: "mall-refund-1" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.totalSpent).toBe(0);
    expect(data.data.membershipLevel).toBe("REGULAR");
    expect(txClient.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalSpent: 0, membershipLevel: "REGULAR" }),
      })
    );
    // 积分联动：退款冲正可用余额（无未释放冻结流水时全部冲可用，可负）
    expect(txClient.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "REFUND",
        amount: -100,
        reference: "points:mall-refund-1",
      }),
    });
  });

  it("并发同步（CAS 命中 0 行）应重读快照重试，不丢失更新", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    // 模拟并发：本请求读到快照 800 时，另一笔 +200 已先入账（消费额变 1000）
    txClient.user.findUnique
      .mockResolvedValueOnce({ totalSpent: 800 })
      // CAS 失败后重读：消费额已变为 1000
      .mockResolvedValueOnce({ totalSpent: 1000 });
    txClient.user.updateMany
      // 第一次：快照 800 已被并发修改，命中 0 行
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const res = await POST(createSignedRequest({ ...VALID_BODY, reference: "mall-order-N2" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    // 重试后基于新快照 1000 入账：1000 + 150 = 1150（仍为银卡档）
    expect(data.data.totalSpent).toBe(1150);
    expect(txClient.user.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "user-1", totalSpent: 1000 },
      data: { totalSpent: 1150, membershipLevel: "SILVER", silverActivatedAt: expect.any(Date) },
    });
  });

  it("重复上报（幂等记录已存在）应返回当前权威消费额并标记 duplicated", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    txClient.spentSyncRecord.findUnique.mockResolvedValue({ id: "rec-1" });
    txClient.user.findUnique.mockResolvedValue({
      totalSpent: 1000,
      membershipLevel: "SILVER",
    });

    const res = await POST(createSignedRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      totalSpent: 1000,
      membershipLevel: "SILVER",
      duplicated: true,
    });
    // 幂等命中时不重复写记录、不重复更新余额
    expect(txClient.spentSyncRecord.create).not.toHaveBeenCalled();
    expect(txClient.user.updateMany).not.toHaveBeenCalled();
  });

  it("并发重复上报（写入触发 P2002）应幂等返回当前权威消费额并标记 duplicated", async () => {
    mockUserFindUnique
      // 第一次：路由按手机号查用户
      .mockResolvedValueOnce({ id: "user-1" })
      // 第二次：P2002 后回读权威消费额
      .mockResolvedValueOnce({ totalSpent: 1000, membershipLevel: "SILVER" });
    txClient.user.findUnique.mockResolvedValue({
      totalSpent: 850,
    });
    txClient.spentSyncRecord.create.mockRejectedValue({ code: "P2002" });

    const res = await POST(createSignedRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      totalSpent: 1000,
      membershipLevel: "SILVER",
      duplicated: true,
    });
    // 事务因 P2002 中止并整体回滚，消费额不会重复入账（幂等返回当前权威值）
  });
});

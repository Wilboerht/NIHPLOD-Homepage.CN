/**
 * POST /api/v1/internal/points/sync 路由测试
 * 覆盖：缺鉴权头 401、签名错误 401、参数校验 400（含 delta/spentDelta 绝对值上限）、
 *       用户不存在 404、成功入账（含等级重算）、负向钳制下限 0（流水记实际生效值）、
 *       CAS 并发重试不出现负余额、重复上报幂等（P2002 → duplicated）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { txClient } = vi.hoisted(() => ({
  txClient: {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    pointTransaction: { create: vi.fn() },
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
  delta: 15,
  spentDelta: 150,
  reference: "mall-order-N001",
  note: "商城订单消费奖励",
};

describe("POST /api/v1/internal/points/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEYS = JSON.stringify([{ project: "mall", key: KEY, secret: SECRET }]);
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
    txClient.pointTransaction.create.mockResolvedValue({});
    // CAS 条件更新默认命中（快照未被并发修改）
    txClient.user.updateMany.mockResolvedValue({ count: 1 });
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

  it("delta 为 0 应返回 400 INVALID_PARAMS", async () => {
    const res = await POST(createSignedRequest({ ...VALID_BODY, delta: 0 }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("delta 超出绝对值上限（±1,000,000）应返回 400 INVALID_PARAMS", async () => {
    const res = await POST(createSignedRequest({ ...VALID_BODY, delta: 2_000_000 }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
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

  it("成功入账：CAS 更新余额、写 EXTERNAL_SYNC 流水并按新消费额重算等级", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    txClient.user.findUnique.mockResolvedValue({
      totalPoints: 100,
      totalSpent: 4900,
      membershipLevel: "ADVANCED",
    });

    const res = await POST(createSignedRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // 4900 + 150 = 5050 ≥ 5000 → 升级 VIP
    expect(data.data).toEqual({
      totalPoints: 115,
      totalSpent: 5050,
      membershipLevel: "VIP",
    });
    // CAS 乐观并发控制：以读取快照作为更新条件
    expect(txClient.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", totalPoints: 100, totalSpent: 4900 },
      data: { totalPoints: 115, totalSpent: 5050, membershipLevel: "VIP" },
    });
    expect(txClient.pointTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        points: 15,
        type: "EXTERNAL_SYNC",
        reference: "mall-order-N001",
        note: "商城订单消费奖励",
      },
    });
  });

  it("积分扣减超过余额时应钳制到 0，流水记录实际生效的扣减量", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    txClient.user.findUnique.mockResolvedValue({
      totalPoints: 5,
      totalSpent: 100,
      membershipLevel: "ADVANCED",
    });

    const res = await POST(
      createSignedRequest({ ...VALID_BODY, delta: -10, spentDelta: 0, reference: "mall-redeem-1" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.totalPoints).toBe(0);
    // 余额 5、请求 -10：实际只扣 5，流水记实际生效值（-5），保证流水合计永远等于余额
    expect(txClient.pointTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ points: -5 }),
      })
    );
    expect(txClient.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalPoints: 0 }),
      })
    );
  });

  it("并发负 delta（CAS 命中 0 行）应重读快照重试，余额不出现负值且流水合计等于余额变动", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    // 模拟并发：本请求读到快照 100 时，另一笔 -80 已先入账（余额变 20）
    txClient.user.findUnique
      .mockResolvedValueOnce({ totalPoints: 100, totalSpent: 800, membershipLevel: "ADVANCED" })
      // CAS 失败后重读：余额已变为 20
      .mockResolvedValueOnce({ totalPoints: 20, totalSpent: 800, membershipLevel: "ADVANCED" });
    txClient.user.updateMany
      // 第一次：快照 100 已被并发修改，命中 0 行
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const res = await POST(
      createSignedRequest({ ...VALID_BODY, delta: -80, spentDelta: 0, reference: "mall-redeem-2" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    // 重试后基于新快照 20 钳制：实际只扣 20，余额 0 而非 -60
    expect(data.data.totalPoints).toBe(0);
    expect(txClient.pointTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ points: -20, reference: "mall-redeem-2" }),
      })
    );
    // 两笔流水合计 -80 + -20 = -100 = 余额变动 100 → 0，账本对得上
    expect(txClient.user.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "user-1", totalPoints: 20, totalSpent: 800 },
      data: { totalPoints: 0, totalSpent: 800, membershipLevel: "ADVANCED" },
    });
  });

  it("重复上报（P2002）应幂等返回当前余额并标记 duplicated", async () => {
    mockUserFindUnique
      // 第一次：路由按手机号查用户
      .mockResolvedValueOnce({ id: "user-1" })
      // 第二次：P2002 后回读权威余额
      .mockResolvedValueOnce({ totalPoints: 115, totalSpent: 5050, membershipLevel: "VIP" });
    txClient.user.findUnique.mockResolvedValue({
      totalPoints: 100,
      totalSpent: 4900,
      membershipLevel: "ADVANCED",
    });
    txClient.pointTransaction.create.mockRejectedValue({ code: "P2002" });

    const res = await POST(createSignedRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      totalPoints: 115,
      totalSpent: 5050,
      membershipLevel: "VIP",
      duplicated: true,
    });
    // 事务因 P2002 中止并整体回滚，余额不会重复入账（幂等返回当前权威余额）
  });
});

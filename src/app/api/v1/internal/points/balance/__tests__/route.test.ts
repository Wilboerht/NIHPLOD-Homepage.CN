/**
 * GET /api/v1/internal/points/balance 路由测试（商城查询积分余额与兑礼率）
 * 覆盖：缺鉴权头 401、签名错误 401、参数校验 400、用户不存在 404、
 *      成功返回余额/冻结/解冻时间/兑礼率/等级
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { txClient } = vi.hoisted(() => ({
  txClient: {
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

import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { generateInternalApiSignature, hashRequestBody } from "@/lib/internal-api";
import { GET } from "@/app/api/v1/internal/points/balance/route";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockUserFindUnique = (prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> })
  .findUnique;

const PATH = "/api/v1/internal/points/balance";
const KEY = "mall-key";
const SECRET = "mall-secret";

let nonceCounter = 0;

function createSignedRequest(phone: string, options?: { badSignature?: boolean }): NextRequest {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = `test-nonce-${++nonceCounter}`;
  const bodyHash = hashRequestBody("");
  let signature = generateInternalApiSignature(SECRET, "GET", PATH, timestamp, nonce, bodyHash);
  if (options?.badSignature) {
    signature = signature.replace(/.$/, signature.endsWith("0") ? "1" : "0");
  }

  return new NextRequest(new URL(`${PATH}?phone=${phone}`, "http://localhost:3000"), {
    method: "GET",
    headers: {
      "x-internal-api-key": KEY,
      "x-internal-api-signature": signature,
      "x-internal-api-timestamp": String(timestamp),
      "x-internal-api-nonce": nonce,
    },
  } as never);
}

describe("GET /api/v1/internal/points/balance（商城查询积分）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEYS = JSON.stringify([{ project: "mall", key: KEY, secret: SECRET }]);
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
    mockUserFindUnique.mockResolvedValue({ id: "user-1", membershipLevel: "GOLD" });
    txClient.pointLedger.findMany.mockResolvedValue([]);
    txClient.pointLedger.findFirst.mockResolvedValue(null);
    txClient.pointBalance.findUnique.mockResolvedValue({ available: 800, frozen: 200 });
  });

  it("缺少鉴权头应返回 401 MISSING_AUTH", async () => {
    const req = new NextRequest(new URL(`${PATH}?phone=13800138000`, "http://localhost:3000"), {
      method: "GET",
    } as never);

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("MISSING_AUTH");
  });

  it("签名错误应返回 401 UNAUTHORIZED", async () => {
    const res = await GET(createSignedRequest("13800138000", { badSignature: true }));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("手机号格式非法应返回 400 INVALID_PARAMS", async () => {
    const res = await GET(createSignedRequest("12345"));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("用户不存在应返回 404 USER_NOT_FOUND", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await GET(createSignedRequest("13800138000"));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("USER_NOT_FOUND");
  });

  it("成功返回余额、冻结、解冻时间与当前兑礼率", async () => {
    const res = await GET(createSignedRequest("13800138000"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      available: 800,
      frozen: 200,
      // 无冻结期：积分发放即到账，无待解冻积分
      nextReleaseAt: null,
      redeemRate: 1.3,
      membershipLevel: "GOLD",
    });
  });
});

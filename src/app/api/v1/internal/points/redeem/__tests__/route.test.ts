/**
 * POST /api/v1/internal/points/redeem 路由测试（商城积分兑礼扣减）
 * 覆盖：缺鉴权头 401、签名错误 401、参数校验 400、用户不存在 404、
 *      余额不足 400、成功扣减 200、重复单据幂等（duplicated: true）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { txClient } = vi.hoisted(() => ({
  txClient: {
    pointLedger: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pointBalance: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
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
import { POST } from "@/app/api/v1/internal/points/redeem/route";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockUserFindUnique = (prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> })
  .findUnique;

const PATH = "/api/v1/internal/points/redeem";
const KEY = "mall-key";
const SECRET = "mall-secret";

let nonceCounter = 0;

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
  points: 300,
  reference: "mall-redeem-R001",
  note: "兑换面霜小样",
};

describe("POST /api/v1/internal/points/redeem（商城积分兑礼扣减）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEYS = JSON.stringify([{ project: "mall", key: KEY, secret: SECRET }]);
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
    mockUserFindUnique.mockResolvedValue({ id: "user-1", membershipLevel: "GOLD" });
    txClient.pointLedger.findUnique.mockResolvedValue(null);
    txClient.pointLedger.findMany.mockResolvedValue([]);
    txClient.pointLedger.create.mockResolvedValue({});
    txClient.pointBalance.upsert.mockResolvedValue({});
    txClient.pointBalance.update.mockResolvedValue({});
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

  it("points 非正整数应返回 400 INVALID_PARAMS", async () => {
    const res = await POST(createSignedRequest({ ...VALID_BODY, points: 0 }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("用户不存在应返回 404 USER_NOT_FOUND", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(createSignedRequest(VALID_BODY));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("USER_NOT_FOUND");
  });

  it("普通档不可兑礼应返回 403 NOT_ELIGIBLE", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1", membershipLevel: "REGULAR" });

    const res = await POST(createSignedRequest(VALID_BODY));

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("NOT_ELIGIBLE");
    expect(txClient.pointLedger.create).not.toHaveBeenCalled();
  });

  it("可用积分不足应返回 400 INSUFFICIENT", async () => {
    txClient.pointBalance.findUnique.mockResolvedValue({ available: 100 });

    const res = await POST(createSignedRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("INSUFFICIENT");
    expect(data.data.available).toBe(100);
  });

  it("成功扣减：返回扣减后余额", async () => {
    txClient.pointBalance.findUnique.mockResolvedValue({ available: 1000 });
    txClient.pointLedger.findMany.mockImplementation(
      async (args: { where?: { releasedAt?: unknown } }) => {
        if (args.where?.releasedAt !== null && args.where?.releasedAt !== undefined) {
          return [{ id: "r1", remaining: 1000 }];
        }
        return [];
      }
    );

    const res = await POST(createSignedRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toEqual({
      available: 700,
      spent: 300,
      redeemRate: 1.3,
      membershipLevel: "GOLD",
    });
    expect(txClient.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "REDEEM",
        amount: -300,
        reference: "redeem:mall-redeem-R001",
      }),
    });
  });

  it("重复单据：幂等返回成功，不重复扣减", async () => {
    txClient.pointLedger.findUnique.mockResolvedValue({ id: "ledger-1" });
    txClient.pointBalance.findUnique.mockResolvedValue({ available: 700 });

    const res = await POST(createSignedRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toEqual({
      available: 700,
      spent: 0,
      duplicated: true,
      redeemRate: 1.3,
      membershipLevel: "GOLD",
    });
    expect(txClient.pointBalance.update).not.toHaveBeenCalled();
  });
});

/**
 * POST /api/v1/internal/points/refund 路由测试（商城兑换撤销退分）
 * 覆盖：鉴权、原兑换流水校验、幂等、成功退分、已注销账户拒绝。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { txClient } = vi.hoisted(() => ({
  txClient: {
    pointLedger: { findUnique: vi.fn() },
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

vi.mock("@/lib/points-ledger", () => ({
  refundRedeemPoints: vi.fn(),
  getPointBalanceView: vi.fn(),
  withPointTxRetry: async <T>(fn: () => Promise<T>) => fn(),
}));

import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { generateInternalApiSignature, hashRequestBody } from "@/lib/internal-api";
import { refundRedeemPoints, getPointBalanceView } from "@/lib/points-ledger";
import { POST } from "@/app/api/v1/internal/points/refund/route";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockUserFindUnique = (prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> })
  .findUnique;
const mockRefund = refundRedeemPoints as ReturnType<typeof vi.fn>;
const mockBalance = getPointBalanceView as ReturnType<typeof vi.fn>;

const PATH = "/api/v1/internal/points/refund";
const KEY = "mall-key";
const SECRET = "mall-secret-0123456789abcdef0123456789";

let nonceCounter = 0;

function createSignedRequest(
  body: unknown,
  options?: { badSignature?: boolean; key?: string }
): NextRequest {
  const bodyText = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = `test-refund-nonce-${++nonceCounter}`;
  const bodyHash = hashRequestBody(bodyText);
  let signature = generateInternalApiSignature(SECRET, "POST", PATH, timestamp, nonce, bodyHash);
  if (options?.badSignature) {
    signature = signature.replace(/.$/, signature.endsWith("0") ? "1" : "0");
  }

  return new NextRequest(new URL(PATH, "http://localhost:3000"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": options?.key ?? KEY,
      "x-internal-api-signature": signature,
      "x-internal-api-timestamp": String(timestamp),
      "x-internal-api-nonce": nonce,
    },
    body: bodyText,
  } as never);
}

const VALID_BODY = {
  userId: "user-1",
  reference: "mall-redeem-R001",
  note: "用户取消兑换",
};

const ORIGINAL_REDEEM = {
  id: "ledger-1",
  type: "REDEEM",
  amount: -300,
};

describe("POST /api/v1/internal/points/refund（兑换撤销退分）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEYS = JSON.stringify([{ project: "mall", key: KEY, secret: SECRET }]);
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
    mockUserFindUnique.mockResolvedValue({ id: "user-1", status: "ACTIVE" });
    txClient.pointLedger.findUnique.mockResolvedValue(ORIGINAL_REDEEM);
    mockRefund.mockResolvedValue({ duplicated: false, amount: 300 });
    mockBalance.mockResolvedValue({ available: 700, frozen: 0, nextReleaseAt: null });
  });

  it("缺少鉴权头返回 401", async () => {
    const req = new NextRequest(new URL(PATH, "http://localhost:3000"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    } as never);
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("MISSING_AUTH");
  });

  it("签名错误返回 401", async () => {
    const res = await POST(createSignedRequest(VALID_BODY, { badSignature: true }));
    expect(res.status).toBe(401);
  });

  it("非 mall project 返回 403", async () => {
    process.env.INTERNAL_API_KEYS = JSON.stringify([
      { project: "advisor", key: KEY, secret: SECRET },
    ]);
    const res = await POST(createSignedRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("用户不存在返回 404", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await POST(createSignedRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it("已注销账户返回 403", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1", status: "DELETED" });
    const res = await POST(createSignedRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("原兑换流水不存在返回 404", async () => {
    txClient.pointLedger.findUnique.mockResolvedValue(null);
    const res = await POST(createSignedRequest(VALID_BODY));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("REDEMPTION_NOT_FOUND");
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it("成功：按原 REDEEM 金额全额退分", async () => {
    const res = await POST(createSignedRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toMatchObject({ userId: "user-1", refunded: 300, available: 700 });
    expect(txClient.pointLedger.findUnique).toHaveBeenCalledWith({
      where: { userId_reference: { userId: "user-1", reference: "redeem:mall-redeem-R001" } },
      select: { id: true, type: true, amount: true },
    });
    expect(mockRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        amount: 300,
        redemptionReference: "mall-redeem-R001",
      })
    );
  });

  it("重复上报：返回 duplicated 且不重复退分", async () => {
    mockRefund.mockResolvedValue({ duplicated: true, amount: 0 });
    const res = await POST(createSignedRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.duplicated).toBe(true);
    expect(data.data.refunded).toBe(0);
  });
});

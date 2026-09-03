/**
 * POST /api/user/points/redeem 路由测试（用户端兑换产品）
 * 覆盖：参数校验 400、非法产品 ID 400、成功 200、积分不足 400、普通档 403
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) =>
    (req: NextRequest) =>
      handler(req, { id: "user-1" }),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn(() => true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/point-gifts", () => ({
  redeemGiftForUser: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { redeemGiftForUser } from "@/lib/point-gifts";
import { POST } from "@/app/api/user/points/redeem/route";

const mockUserFindUnique = (prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> })
  .findUnique;
const mockRedeem = redeemGiftForUser as ReturnType<typeof vi.fn>;

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/user/points/redeem", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const VALID_BODY = { productId: "cm1234567890abcdefghijklm", requestId: "req-uuid-1" };

describe("POST /api/user/points/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ membershipLevel: "GOLD" });
    mockRedeem.mockResolvedValue({
      ok: true,
      duplicated: false,
      points: 230,
      available: 770,
      redemptionId: "redemption-1",
    });
  });

  it("缺少 requestId 应返回 400 INVALID_PARAMS", async () => {
    const res = await POST(postRequest({ productId: VALID_BODY.productId }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("非法产品 ID 应返回 400", async () => {
    const res = await POST(postRequest({ productId: "not-a-cuid", requestId: "req-1" }));

    expect(res.status).toBe(400);
  });

  it("兑换成功应返回扣分与剩余积分", async () => {
    const res = await POST(postRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      redemptionId: "redemption-1",
      points: 230,
      available: 770,
      duplicated: false,
    });
    expect(mockRedeem).toHaveBeenCalledWith({
      userId: "user-1",
      productId: VALID_BODY.productId,
      requestId: "req-uuid-1",
      level: "GOLD",
    });
  });

  it("积分不足应返回 400 INSUFFICIENT", async () => {
    mockRedeem.mockResolvedValue({ ok: false, code: "INSUFFICIENT", message: "可用积分不足" });

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INSUFFICIENT");
  });

  it("普通档应返回 403 NOT_ELIGIBLE", async () => {
    mockRedeem.mockResolvedValue({
      ok: false,
      code: "NOT_ELIGIBLE",
      message: "银卡及以上会员可参与积分兑换",
    });

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("NOT_ELIGIBLE");
  });
});

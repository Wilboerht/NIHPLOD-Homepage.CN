/**
 * OAuth 积分/地址资源端点单元测试
 *
 * 覆盖：鉴权/scope/M2M 拒绝/账户状态，以及各端点对共享核心
 * （points-mall-api）的委派与参数传递。核心数据逻辑另有会话路由测试覆盖。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockIsBlacklisted = vi.fn();
vi.mock("@/lib/token-blacklist", () => ({
  isTokenBlacklisted: (...args: unknown[]) => mockIsBlacklisted(...args),
}));

const mockVerifyOAuthAccessToken = vi.fn();
vi.mock("@/lib/jwt", () => ({
  verifyOAuthAccessToken: (...args: unknown[]) => mockVerifyOAuthAccessToken(...args),
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn(),
  scheduleSsoEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockUserFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) } },
}));

vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

const mall = vi.hoisted(() => ({
  getPointsOverviewResponse: vi.fn(),
  getPointGiftsResponse: vi.fn(),
  redeemPointsResponse: vi.fn(),
  getRedemptionsResponse: vi.fn(),
  getRedemptionTrackingResponse: vi.fn(),
  getAddressesResponse: vi.fn(),
  createAddressResponse: vi.fn(),
  updateAddressResponse: vi.fn(),
  deleteAddressResponse: vi.fn(),
}));
vi.mock("@/lib/points-mall-api", () => mall);

import { GET as pointsGET } from "../points/route";
import { GET as giftsGET } from "../points/gifts/route";
import { POST as redeemPOST } from "../points/redeem/route";
import { GET as redemptionsGET } from "../points/redemptions/route";
import { GET as trackingGET } from "../points/redemptions/[id]/tracking/route";
import { GET as addressesGET, POST as addressesPOST } from "../addresses/route";
import { PATCH as addressPATCH, DELETE as addressDELETE } from "../addresses/[id]/route";

function authedToken(scope = "openid membership") {
  mockVerifyOAuthAccessToken.mockResolvedValue({
    id: "user-1",
    client_id: "test-client",
    scope,
  });
}

function req(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(`http://localhost${url}`), {
    method,
    headers: {
      Authorization: "Bearer valid-token",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  } as never);
}

const okResponse = () => NextResponse.json({ success: true, data: {} });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/oauth/points* 与 /api/oauth/addresses*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlacklisted.mockReturnValue(false);
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ status: "ACTIVE" });
    for (const fn of Object.values(mall)) {
      (fn as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse());
    }
  });

  it("缺少 Authorization 返回 401", async () => {
    const res = await pointsGET(
      new NextRequest(new URL("http://localhost/api/oauth/points")) as never
    );
    expect(res.status).toBe(401);
    expect(mall.getPointsOverviewResponse).not.toHaveBeenCalled();
  });

  it("scope 不含 membership 返回 403", async () => {
    authedToken("openid profile");
    const res = await pointsGET(req("GET", "/api/oauth/points"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
    expect(mall.getPointsOverviewResponse).not.toHaveBeenCalled();
  });

  it("M2M token 返回 403", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "client:abc",
      client_id: "test-client",
      scope: "openid membership",
    });
    const res = await pointsGET(req("GET", "/api/oauth/points"));
    expect(res.status).toBe(403);
    expect(mall.getPointsOverviewResponse).not.toHaveBeenCalled();
  });

  it("账户非 ACTIVE 返回 403 account_disabled", async () => {
    authedToken();
    mockUserFindUnique.mockResolvedValue({ status: "BANNED" });
    const res = await pointsGET(req("GET", "/api/oauth/points"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("account_disabled");
  });

  it("积分余额/礼品/记录/物流/地址列表均委派共享核心", async () => {
    authedToken();

    expect((await pointsGET(req("GET", "/api/oauth/points"))).status).toBe(200);
    expect(mall.getPointsOverviewResponse).toHaveBeenCalledWith("user-1");

    expect((await giftsGET(req("GET", "/api/oauth/points/gifts"))).status).toBe(200);
    expect(mall.getPointGiftsResponse).toHaveBeenCalledWith("user-1");

    expect((await redemptionsGET(req("GET", "/api/oauth/points/redemptions?offset=0"))).status).toBe(200);
    expect(mall.getRedemptionsResponse).toHaveBeenCalledWith("user-1", expect.any(Request));

    expect(
      (await trackingGET(req("GET", "/api/oauth/points/redemptions/rid-1/tracking"), ctx("rid-1"))).status
    ).toBe(200);
    expect(mall.getRedemptionTrackingResponse).toHaveBeenCalledWith("user-1", "rid-1");

    expect((await addressesGET(req("GET", "/api/oauth/addresses"))).status).toBe(200);
    expect(mall.getAddressesResponse).toHaveBeenCalledWith("user-1");
  });

  it("兑换/新增地址/编辑地址/删除地址均委派共享核心", async () => {
    authedToken();

    expect(
      (await redeemPOST(req("POST", "/api/oauth/points/redeem", { productId: "p", addressId: "a", requestId: "r" }))).status
    ).toBe(200);
    expect(mall.redeemPointsResponse).toHaveBeenCalledWith("user-1", expect.any(Request));

    expect(
      (await addressesPOST(req("POST", "/api/oauth/addresses", { recipient: "x" }))).status
    ).toBe(200);
    expect(mall.createAddressResponse).toHaveBeenCalledWith("user-1", expect.any(Request));

    expect(
      (await addressPATCH(req("PATCH", "/api/oauth/addresses/aid-1", { recipient: "x" }), ctx("aid-1"))).status
    ).toBe(200);
    expect(mall.updateAddressResponse).toHaveBeenCalledWith("user-1", "aid-1", expect.any(Request));

    expect(
      (await addressDELETE(req("DELETE", "/api/oauth/addresses/aid-1"), ctx("aid-1"))).status
    ).toBe(200);
    expect(mall.deleteAddressResponse).toHaveBeenCalledWith("user-1", "aid-1");
  });
});

/**
 * POST /api/auth/logout 路由测试（access token 失效时的 refresh token 撤销）
 * 覆盖：verifyUserAuth 失败但 refresh cookie 存在时，仍按 JWT 校验 + DB 哈希比对
 *       定位并撤销该 refresh token（含关联 OAuthSession 撤销）；
 *       refresh token 无效/缺失时不撤销；任何路径都清 Cookie 保持登出幂等
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

vi.mock("@/lib/auth", () => ({
  verifyUserAuth: vi.fn(),
}));

vi.mock("@/lib/jwt", () => ({
  verifyRefreshToken: vi.fn(),
}));

vi.mock("@/lib/auth-security", () => ({
  revokeRefreshToken: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/lib/token-blacklist", () => ({
  revokeAccessToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    refreshToken: { findFirst: vi.fn() },
    oAuthSession: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
  CSRF_COOKIE_NAME: "__Host-csrf_token",
}));

import { verifyUserAuth } from "@/lib/auth";
import { verifyRefreshToken } from "@/lib/jwt";
import { revokeRefreshToken } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { USER_COOKIE_NAME, USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { POST } from "@/app/api/auth/logout/route";

const mockVerifyUserAuth = verifyUserAuth as ReturnType<typeof vi.fn>;
const mockVerifyRefreshToken = verifyRefreshToken as ReturnType<typeof vi.fn>;
const mockRevokeRefreshToken = revokeRefreshToken as ReturnType<typeof vi.fn>;
const mockRefreshFindFirst = prisma.refreshToken.findFirst as ReturnType<typeof vi.fn>;
const mockOAuthUpdateMany = prisma.oAuthSession.updateMany as ReturnType<typeof vi.fn>;
const mockSendBackchannel = sendBackchannelLogout as ReturnType<typeof vi.fn>;

const REFRESH_TOKEN = "rt-value";

function createRequest(withRefreshCookie = true): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withRefreshCookie) {
    headers["cookie"] = `${USER_REFRESH_COOKIE_NAME}=${REFRESH_TOKEN}`;
  }
  return new NextRequest(new URL("/api/auth/logout", "http://localhost:3000"), {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  } as never);
}

function expectCookiesCleared(res: Response) {
  const setCookies = res.headers.getSetCookie();
  const access = setCookies.find((c) => c.startsWith(`${USER_COOKIE_NAME}=`));
  const refresh = setCookies.find((c) => c.startsWith(`${USER_REFRESH_COOKIE_NAME}=`));
  expect(access).toBeDefined();
  expect(refresh).toBeDefined();
  expect(access).toContain("Max-Age=0");
  expect(refresh).toContain("Max-Age=0");
}

describe("POST /api/auth/logout access token 失效场景", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // access token 已失效（过期/撤销）：verifyUserAuth 返回 null
    mockVerifyUserAuth.mockResolvedValue(null);
    mockVerifyRefreshToken.mockResolvedValue({ id: "user-1", type: "refresh" });
    mockRefreshFindFirst.mockResolvedValue({ clientId: "oauth-client-1" });
    mockOAuthUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("refresh cookie 有效：撤销该 refresh token 并撤销关联 OAuthSession，仍返回成功", async () => {
    const res = await POST(createRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // JWT 校验 + DB 哈希比对定位该 refresh token
    expect(mockVerifyRefreshToken).toHaveBeenCalledWith(REFRESH_TOKEN);
    const tokenHash = createHash("sha256").update(REFRESH_TOKEN).digest("hex");
    expect(mockRefreshFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", token: tokenHash, revokedAt: null },
      select: { clientId: true },
    });
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", REFRESH_TOKEN);
    // 关联 OAuthSession 一并撤销（含 Backchannel Logout 通知）
    expect(mockSendBackchannel).toHaveBeenCalledWith("user-1", ["oauth-client-1"]);
    expect(mockOAuthUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "oauth-client-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expectCookiesCleared(res);
  });

  it("refresh token 无关联 OAuth client：仅撤销 refresh token，不触碰 OAuthSession", async () => {
    mockRefreshFindFirst.mockResolvedValue({ clientId: null });

    const res = await POST(createRequest());

    expect(res.status).toBe(200);
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", REFRESH_TOKEN);
    expect(mockSendBackchannel).not.toHaveBeenCalled();
    expect(mockOAuthUpdateMany).not.toHaveBeenCalled();
    expectCookiesCleared(res);
  });

  it("refresh token JWT 无效：不撤销任何 token，但仍清 Cookie 返回成功（幂等）", async () => {
    mockVerifyRefreshToken.mockResolvedValue(null);

    const res = await POST(createRequest());

    expect(res.status).toBe(200);
    expect(mockRevokeRefreshToken).not.toHaveBeenCalled();
    expectCookiesCleared(res);
  });

  it("DB 中无匹配 refresh token 记录：不撤销，但仍清 Cookie 返回成功（幂等）", async () => {
    mockRefreshFindFirst.mockResolvedValue(null);

    const res = await POST(createRequest());

    expect(res.status).toBe(200);
    expect(mockRevokeRefreshToken).not.toHaveBeenCalled();
    expectCookiesCleared(res);
  });

  it("无 refresh cookie：跳过撤销，仍返回成功（未登录幂等登出）", async () => {
    const res = await POST(createRequest(false));

    expect(res.status).toBe(200);
    expect(mockVerifyRefreshToken).not.toHaveBeenCalled();
    expect(mockRevokeRefreshToken).not.toHaveBeenCalled();
    expectCookiesCleared(res);
  });

  it("撤销过程抛异常：不阻断登出，仍清 Cookie 返回成功", async () => {
    mockRefreshFindFirst.mockRejectedValue(new Error("db down"));

    const res = await POST(createRequest());

    expect(res.status).toBe(200);
    expectCookiesCleared(res);
  });
});

/**
 * POST /api/auth/refresh 路由测试（refresh token 移除明文手机号）
 * 覆盖：新 refresh token 不再携带 phone claim；审计日志 identifier 改为
 *       按 id 查库取手机号（与 logout 路由同款做法）；
 *       OAuth token（client_id）拒绝路径同样使用查库手机号
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/jwt", () => ({
  verifyRefreshToken: vi.fn(),
  signUserToken: vi.fn(),
  signRefreshToken: vi.fn(),
  getTokenExpiresAt: vi.fn(),
  getRefreshTokenExpiresAt: vi.fn(),
}));

vi.mock("@/lib/auth-security", () => ({
  atomicallyRotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  extractDeviceInfo: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/auth", () => ({
  checkUserStatus: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

import {
  verifyRefreshToken,
  signUserToken,
  signRefreshToken,
  getTokenExpiresAt,
  getRefreshTokenExpiresAt,
} from "@/lib/jwt";
import { atomicallyRotateRefreshToken } from "@/lib/auth-security";
import { checkUserStatus } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { logAuthEvent } from "@/lib/auth-logger";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { POST } from "@/app/api/auth/refresh/route";

const mockVerify = verifyRefreshToken as ReturnType<typeof vi.fn>;
const mockRotate = atomicallyRotateRefreshToken as ReturnType<typeof vi.fn>;
const mockCheckStatus = checkUserStatus as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockLogAuthEvent = logAuthEvent as ReturnType<typeof vi.fn>;

function createRequest(refreshToken?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (refreshToken) {
    headers["cookie"] = `${USER_REFRESH_COOKIE_NAME}=${refreshToken}`;
  }
  return new NextRequest(new URL("/api/auth/refresh", "http://localhost:3000"), {
    method: "POST",
    headers,
  } as never);
}

// 新版 refresh token payload 不再携带明文手机号 claim
const basePayload = { id: "user-1", type: "refresh", iat: 1700000000 };

describe("POST /api/auth/refresh 手机号查库（A4）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    mockCheckStatus.mockResolvedValue({ valid: true });
    mockRotate.mockResolvedValue({ valid: true });
    mockUserFindUnique.mockResolvedValue({ phone: "13800138000" });
    (signUserToken as ReturnType<typeof vi.fn>).mockResolvedValue("new-at");
    (signRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue("new-rt");
    (getTokenExpiresAt as ReturnType<typeof vi.fn>).mockReturnValue("at-exp");
    (getRefreshTokenExpiresAt as ReturnType<typeof vi.fn>).mockReturnValue("rt-exp");
  });

  it("正常轮换：新 refresh token 不携带 phone，审计 identifier 来自查库手机号", async () => {
    mockVerify.mockResolvedValue(basePayload);

    const res = await POST(createRequest("old-rt"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // 新 refresh token 不写入明文手机号 claim
    expect(signRefreshToken).toHaveBeenCalledWith({ id: "user-1", authTime: 1700000000 });
    // 审计日志 identifier 按 id 查库取手机号
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { phone: true },
    });
    expect(mockLogAuthEvent).toHaveBeenCalledWith(
      "user_refresh_token",
      expect.objectContaining({ success: true, identifier: "13800138000" })
    );
  });

  it("携带 client_id 的 OAuth Refresh Token 被拒绝，审计 identifier 同样来自查库", async () => {
    mockVerify.mockResolvedValue({ ...basePayload, client_id: "oauth-app" });

    const res = await POST(createRequest("oauth-rt"));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe("INVALID_TOKEN");
    expect(mockLogAuthEvent).toHaveBeenCalledWith(
      "user_refresh_token",
      expect.objectContaining({
        success: false,
        reason: "oauth_token_on_internal_endpoint",
        identifier: "13800138000",
      })
    );
    expect(mockRotate).not.toHaveBeenCalled();
  });

  it("查库无用户：identifier 为 undefined，不影响刷新流程", async () => {
    mockVerify.mockResolvedValue(basePayload);
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(createRequest("old-rt"));

    expect(res.status).toBe(200);
    expect(mockLogAuthEvent).toHaveBeenCalledWith(
      "user_refresh_token",
      expect.objectContaining({ success: true, identifier: undefined })
    );
  });
});

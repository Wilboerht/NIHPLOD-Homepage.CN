/**
 * POST /api/auth/wechat/miniprogram-refresh 路由测试
 * 覆盖：参数校验、无效令牌 401、OAuth token（client_id）拒绝、封禁 403、
 *       正常轮换返回新双 Token、重用检测（已撤销 → 撤销该用户全部刷新令牌）
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
  extractDeviceInfo: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  checkUserStatus: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(),
  getClientIP: vi.fn(),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

import {
  verifyRefreshToken,
  signUserToken,
  signRefreshToken,
  getTokenExpiresAt,
  getRefreshTokenExpiresAt,
} from "@/lib/jwt";
import { atomicallyRotateRefreshToken, revokeRefreshToken } from "@/lib/auth-security";
import { checkUserStatus } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { POST } from "@/app/api/auth/wechat/miniprogram-refresh/route";

const mockVerify = verifyRefreshToken as ReturnType<typeof vi.fn>;
const mockRotate = atomicallyRotateRefreshToken as ReturnType<typeof vi.fn>;
const mockRevoke = revokeRefreshToken as ReturnType<typeof vi.fn>;
const mockCheckStatus = checkUserStatus as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest(
    new URL("/api/auth/wechat/miniprogram-refresh", "http://localhost:3000"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    } as never
  );
}

const basePayload = { id: "user-1", phone: "13800138000", iat: 1700000000 };

describe("POST /api/auth/wechat/miniprogram-refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
    mockCheckStatus.mockResolvedValue({ valid: true });
    mockRotate.mockResolvedValue({ valid: true });
    (signUserToken as ReturnType<typeof vi.fn>).mockResolvedValue("new-at");
    (signRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue("new-rt");
    (getTokenExpiresAt as ReturnType<typeof vi.fn>).mockReturnValue("at-exp");
    (getRefreshTokenExpiresAt as ReturnType<typeof vi.fn>).mockReturnValue("rt-exp");
  });

  it("超限应返回 429", async () => {
    mockRateLimit.mockResolvedValue({ success: false });

    const res = await POST(createRequest({ refreshToken: "rt" }));

    expect(res.status).toBe(429);
  });

  it("缺少 refreshToken 应返回 400", async () => {
    const res = await POST(createRequest({}));

    expect(res.status).toBe(400);
    expect(((await res.json()).error.code as string)).toBe("INVALID_PARAMS");
  });

  it("无效令牌应返回 401 INVALID_TOKEN", async () => {
    mockVerify.mockResolvedValue(null);

    const res = await POST(createRequest({ refreshToken: "bad-rt" }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe("INVALID_TOKEN");
    expect(mockRotate).not.toHaveBeenCalled();
  });

  it("携带 client_id 的 OAuth Refresh Token 应被拒绝", async () => {
    mockVerify.mockResolvedValue({ ...basePayload, client_id: "oauth-app" });

    const res = await POST(createRequest({ refreshToken: "oauth-rt" }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe("INVALID_TOKEN");
    expect(mockRotate).not.toHaveBeenCalled();
  });

  it("封禁账户应返回 403 ACCOUNT_DISABLED", async () => {
    mockVerify.mockResolvedValue(basePayload);
    mockCheckStatus.mockResolvedValue({
      valid: false,
      status: "BANNED",
      reason: "账号已被封禁",
    });

    const res = await POST(createRequest({ refreshToken: "rt" }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("正常轮换应在 JSON body 返回新双 Token", async () => {
    mockVerify.mockResolvedValue(basePayload);

    const res = await POST(createRequest({ refreshToken: "old-rt" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.accessToken).toBe("new-at");
    expect(data.data.refreshToken).toBe("new-rt");
    expect(data.data.accessTokenExpiresAt).toBe("at-exp");
    expect(data.data.refreshTokenExpiresAt).toBe("rt-exp");
    // auth_time 缺省透传 iat
    expect(signUserToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", authTime: 1700000000 })
    );
    expect(mockRotate).toHaveBeenCalledWith(
      "user-1",
      "old-rt",
      "new-rt",
      expect.any(Date),
      undefined
    );
  });

  it("Refresh Token 重用（已撤销）应撤销该用户全部刷新令牌并返回 401", async () => {
    mockVerify.mockResolvedValue(basePayload);
    mockRotate.mockResolvedValue({ valid: false, reason: "revoked" });

    const res = await POST(createRequest({ refreshToken: "reused-rt" }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe("TOKEN_REVOKED");
    expect(mockRevoke).toHaveBeenCalledWith("user-1");
  });
});

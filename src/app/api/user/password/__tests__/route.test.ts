/**
 * PUT /api/user/password 路由测试（用户自主改密）
 * 覆盖：改密成功撤销会话后向活跃 OAuth client 发送 backchannel logout（含 sid）、
 *       无活跃 OAuth 会话时不发送、backchannel logout 失败不阻断改密响应
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { UserJWTPayload } from "@/types/auth";

const mockUserFindUnique = vi.fn();
const mockRefreshTokenUpdateMany = vi.fn();
const mockOAuthSessionFindMany = vi.fn();
const mockOAuthSessionUpdateMany = vi.fn();
const mockSendBackchannelLogout = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    refreshToken: { updateMany: (...args: unknown[]) => mockRefreshTokenUpdateMany(...args) },
    oAuthSession: {
      findMany: (...args: unknown[]) => mockOAuthSessionFindMany(...args),
      updateMany: (...args: unknown[]) => mockOAuthSessionUpdateMany(...args),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  // 直接以内置用户身份调用 handler，跳过真实 JWT 校验
  withUserAuth:
    (handler: (request: NextRequest, user: UserJWTPayload) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(request, { id: "user-1", type: "user" } as UserJWTPayload),
}));

vi.mock("@/lib/password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/password")>()),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/password-policy", () => ({
  updateUserPassword: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/auth-security", () => ({
  checkAccountLockout: vi.fn().mockResolvedValue({ locked: false }),
  recordLoginAttempt: vi.fn(),
  clearLoginAttempts: vi.fn(),
  hashRefreshToken: vi.fn().mockReturnValue("hashed-refresh"),
}));

vi.mock("@/lib/sms", () => ({
  sendPasswordChangedNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: (...args: unknown[]) => mockSendBackchannelLogout(...args),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

import { PUT } from "@/app/api/user/password/route";

function putRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/user/password", "http://localhost:3000"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const validBody = {
  oldPassword: "OldPass123",
  newPassword: "NewPass456a",
  confirmPassword: "NewPass456a",
};

describe("PUT /api/user/password - 改密后 backchannel logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      password: "hashed-old",
      phone: "13800138000",
    });
    mockRefreshTokenUpdateMany.mockResolvedValue({ count: 1 });
    mockOAuthSessionUpdateMany.mockResolvedValue({ count: 1 });
    mockSendBackchannelLogout.mockResolvedValue(undefined);
  });

  it("改密成功且存在活跃 OAuth 会话：撤销后按 clientId 通知子站（携带 sid）", async () => {
    mockOAuthSessionFindMany.mockResolvedValue([
      { clientId: "advisor", sessionId: "sid-1" },
      { clientId: "advisor", sessionId: "sid-2" },
      { clientId: "mall", sessionId: "sid-3" },
    ]);

    const res = await PUT(putRequest(validBody));

    expect(res.status).toBe(200);
    expect(mockOAuthSessionUpdateMany).toHaveBeenCalled();
    // clientId 去重，sid 取各 client 首个活跃会话
    expect(mockSendBackchannelLogout).toHaveBeenCalledTimes(1);
    expect(mockSendBackchannelLogout).toHaveBeenCalledWith(
      "user-1",
      ["advisor", "mall"],
      { sids: { advisor: "sid-1", mall: "sid-3" } }
    );
  });

  it("无活跃 OAuth 会话时不发送 backchannel logout", async () => {
    mockOAuthSessionFindMany.mockResolvedValue([]);

    const res = await PUT(putRequest(validBody));

    expect(res.status).toBe(200);
    expect(mockSendBackchannelLogout).not.toHaveBeenCalled();
  });

  it("backchannel logout 投递失败不阻断改密成功响应", async () => {
    mockOAuthSessionFindMany.mockResolvedValue([{ clientId: "advisor", sessionId: "sid-1" }]);
    mockSendBackchannelLogout.mockRejectedValue(new Error("network down"));

    const res = await PUT(putRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

/**
 * OAuth 密码管理端点测试
 * PUT  /api/oauth/user/password            - 修改密码（旧密码）
 * POST /api/oauth/user/password/set        - 首次设置密码（短信验证码）
 * POST /api/oauth/user/password/send-code  - 发送设置密码验证码
 *
 * 业务核心与主站会话路由共用（src/lib/password-manage.ts，已有覆盖）；
 * 本文件聚焦 OAuth 通道接线：scope=profile:write、错误映射、无 Cookie 全撤会话。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  rateLimit: vi.fn(),
  revokeOtherSessions: vi.fn(),
  findUnique: vi.fn(),
  smsFindFirst: vi.fn(),
  smsUpdateMany: vi.fn(),
  smsCreate: vi.fn(),
  smsCount: vi.fn(),
  verifyCode: vi.fn(),
  recordSmsCodeFailure: vi.fn(),
  sendLoginCode: vi.fn(),
  sendPasswordChangedNotification: vi.fn(),
  updateUserPassword: vi.fn(),
  verifyPassword: vi.fn(),
  checkAccountLockout: vi.fn(),
  recordLoginAttempt: vi.fn(),
  clearLoginAttempts: vi.fn(),
  invalidateProfileCache: vi.fn(),
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/oauth-user-auth", () => ({
  authenticateOAuthUserRequest: mocks.authenticate,
}));

vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: mocks.rateLimit,
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/session-revocation", () => ({
  revokeOtherSessionsAfterCredentialChange: mocks.revokeOtherSessions,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
    smsCode: {
      findFirst: mocks.smsFindFirst,
      create: mocks.smsCreate,
      updateMany: mocks.smsUpdateMany,
      count: mocks.smsCount,
    },
  },
}));

vi.mock("@/lib/password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/password")>()),
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("@/lib/password-policy", () => ({
  updateUserPassword: mocks.updateUserPassword,
}));

vi.mock("@/lib/auth-security", () => ({
  checkAccountLockout: mocks.checkAccountLockout,
  recordLoginAttempt: mocks.recordLoginAttempt,
  clearLoginAttempts: mocks.clearLoginAttempts,
}));

vi.mock("@/lib/sms", () => ({
  verifyCode: mocks.verifyCode,
  recordSmsCodeFailure: mocks.recordSmsCodeFailure,
  sendLoginCode: mocks.sendLoginCode,
  sendPasswordChangedNotification: mocks.sendPasswordChangedNotification,
  generateVerifyCode: vi.fn().mockReturnValue("123456"),
  hashVerifyCode: vi.fn().mockReturnValue("hashed-code"),
  SMS_CODE_MAX_ATTEMPTS: 5,
}));

vi.mock("@/lib/points", () => ({ invalidateProfileCache: mocks.invalidateProfileCache }));
vi.mock("@/lib/auth-logger", () => ({ logAuthEvent: mocks.logAuthEvent }));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { PUT } from "@/app/api/oauth/user/password/route";
import { POST as SET } from "@/app/api/oauth/user/password/set/route";
import { POST as SEND_CODE } from "@/app/api/oauth/user/password/send-code/route";

const mockAuthenticate = authenticateOAuthUserRequest as ReturnType<typeof vi.fn>;

function authOk() {
  return {
    ok: true as const,
    payload: { id: "user-1", client_id: "client-1", scope: "openid profile:write", type: "access_token" },
    ip: "127.0.0.1",
    resJson: (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
      NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } }),
    corsHeaders: {},
  };
}

function createRequest(url: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const changeBody = { oldPassword: "OldPass123", newPassword: "NewPass456a", confirmPassword: "NewPass456a" };
const setBody = { code: "123456", password: "Abc12345!", confirmPassword: "Abc12345!" };
const CODE_RECORD = { id: "sms-1", codeHash: "hashed-code", ipAddress: "127.0.0.1" };

describe("OAuth 密码管理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    mockAuthenticate.mockResolvedValue(authOk());
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.revokeOtherSessions.mockResolvedValue(undefined);
    mocks.findUnique.mockResolvedValue({ id: "user-1", phone: "13800138000", password: null });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.updateUserPassword.mockResolvedValue({ success: true });
    mocks.checkAccountLockout.mockResolvedValue({ locked: false });
    mocks.smsFindFirst.mockResolvedValue(null);
    mocks.smsUpdateMany.mockResolvedValue({ count: 1 });
    mocks.smsCount.mockResolvedValue(0);
    mocks.smsCreate.mockResolvedValue({});
    mocks.verifyCode.mockReturnValue(true);
    mocks.sendLoginCode.mockResolvedValue({ success: true });
    mocks.sendPasswordChangedNotification.mockResolvedValue(undefined);
  });

  describe("PUT /api/oauth/user/password", () => {
    it("鉴权失败时直接返回鉴权响应，且请求 scope=profile:write", async () => {
      const denied = NextResponse.json({ error: "insufficient_scope" }, { status: 403 });
      mockAuthenticate.mockResolvedValue({ ok: false, response: denied });

      const res = await PUT(createRequest("/api/oauth/user/password", changeBody, "PUT"));
      expect(res.status).toBe(403);
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.anything(),
        "PUT",
        expect.objectContaining({ scope: "profile:write" })
      );
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });

    it("参数非法应返回 400 INVALID_PARAMS", async () => {
      const res = await PUT(createRequest("/api/oauth/user/password", { oldPassword: "" }, "PUT"));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_PARAMS");
    });

    it("改密成功：更新密码并全撤会话（currentRefreshToken=null）", async () => {
      mocks.findUnique.mockResolvedValue({ id: "user-1", phone: "13800138000", password: "hashed-old" });
      const res = await PUT(createRequest("/api/oauth/user/password", changeBody, "PUT"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mocks.updateUserPassword).toHaveBeenCalledWith("user-1", "NewPass456a");
      expect(mocks.revokeOtherSessions).toHaveBeenCalledWith({
        userId: "user-1",
        currentRefreshToken: null,
      });
      expect(mocks.invalidateProfileCache).toHaveBeenCalled();
    });

    it("旧密码错误应返回 400 PASSWORD_INCORRECT，且不撤销会话", async () => {
      mocks.findUnique.mockResolvedValue({ id: "user-1", phone: "13800138000", password: "hashed-old" });
      mocks.verifyPassword.mockResolvedValue(false);
      const res = await PUT(createRequest("/api/oauth/user/password", changeBody, "PUT"));

      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("PASSWORD_INCORRECT");
      expect(mocks.revokeOtherSessions).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/oauth/user/password/set", () => {
    it("成功设置密码：核销验证码并全撤会话", async () => {
      mocks.smsFindFirst.mockResolvedValue(CODE_RECORD);
      const res = await SET(createRequest("/api/oauth/user/password/set", setBody));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mocks.smsUpdateMany).toHaveBeenCalled();
      expect(mocks.updateUserPassword).toHaveBeenCalledWith("user-1", "Abc12345!");
      expect(mocks.revokeOtherSessions).toHaveBeenCalledWith({
        userId: "user-1",
        currentRefreshToken: null,
      });
    });

    it("验证码错误应返回 400 CODE_INVALID 并记录单码失败", async () => {
      mocks.smsFindFirst.mockResolvedValue(CODE_RECORD);
      mocks.verifyCode.mockReturnValue(false);
      const res = await SET(createRequest("/api/oauth/user/password/set", setBody));

      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("CODE_INVALID");
      expect(mocks.recordSmsCodeFailure).toHaveBeenCalledWith("sms-1");
      expect(mocks.revokeOtherSessions).not.toHaveBeenCalled();
    });

    it("已设置过密码应返回 400 PASSWORD_ALREADY_SET", async () => {
      mocks.findUnique.mockResolvedValue({ id: "user-1", phone: "13800138000", password: "hashed" });
      const res = await SET(createRequest("/api/oauth/user/password/set", setBody));

      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("PASSWORD_ALREADY_SET");
    });
  });

  describe("POST /api/oauth/user/password/send-code", () => {
    it("成功发送：向本人手机号写入 reset 验证码", async () => {
      mocks.findUnique.mockResolvedValue({ id: "user-1", phone: "13800138000" });
      const res = await SEND_CODE(createRequest("/api/oauth/user/password/send-code", {}));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.expiresIn).toBe(300);
      expect(mocks.smsCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ phone: "13800138000", type: "reset" }),
      });
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.anything(),
        "POST",
        expect.objectContaining({ scope: "profile:write" })
      );
    });

    it("微信占位手机号应返回 PHONE_NOT_BOUND", async () => {
      mocks.findUnique.mockResolvedValue({ id: "user-1", phone: "wx_abc123" });
      const res = await SEND_CODE(createRequest("/api/oauth/user/password/send-code", {}));

      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("PHONE_NOT_BOUND");
      expect(mocks.smsCreate).not.toHaveBeenCalled();
    });

    it("用户级限流触发应返回 429", async () => {
      mocks.rateLimit.mockResolvedValueOnce({ success: false });
      const res = await SEND_CODE(createRequest("/api/oauth/user/password/send-code", {}));

      expect(res.status).toBe(429);
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });
  });
});

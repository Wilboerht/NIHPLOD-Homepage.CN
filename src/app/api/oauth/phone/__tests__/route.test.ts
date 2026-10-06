/**
 * OAuth 换绑手机号端点测试
 * PUT  /api/oauth/phone            - 双验证码换绑（Bearer + scope=phone）
 * POST /api/oauth/phone/send-code  - 发送换绑验证码
 *
 * 业务核心与主站会话路由共用（src/lib/phone-rebind.ts，已有覆盖）；
 * 本文件聚焦 OAuth 通道接线：scope 校验、限流、错误映射、无 Cookie 全撤会话。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const AUTH_CONTEXT = { id: "user-1" };

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  rateLimit: vi.fn(),
  revokeOtherSessions: vi.fn(),
  findUnique: vi.fn(),
  userUpdate: vi.fn(),
  smsFindFirst: vi.fn(),
  smsUpdateMany: vi.fn(),
  smsCreate: vi.fn(),
  smsCount: vi.fn(),
  verifyCode: vi.fn(),
  recordSmsCodeFailure: vi.fn(),
  sendLoginCode: vi.fn(),
  sendPhoneChangedNotification: vi.fn(),
  simulateSmsSendLatency: vi.fn(),
  recordFakeSmsThrottleEntry: vi.fn(),
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
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

vi.mock("@/lib/session-revocation", () => ({
  revokeOtherSessionsAfterCredentialChange: mocks.revokeOtherSessions,
}));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: mocks.findUnique, update: mocks.userUpdate },
    smsCode: {
      findFirst: mocks.smsFindFirst,
      create: mocks.smsCreate,
      updateMany: mocks.smsUpdateMany,
      count: mocks.smsCount,
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma)
  );
  return { prisma };
});

vi.mock("@/lib/sms", () => ({
  verifyCode: mocks.verifyCode,
  recordSmsCodeFailure: mocks.recordSmsCodeFailure,
  sendLoginCode: mocks.sendLoginCode,
  sendPhoneChangedNotification: mocks.sendPhoneChangedNotification,
  simulateSmsSendLatency: mocks.simulateSmsSendLatency,
  recordFakeSmsThrottleEntry: mocks.recordFakeSmsThrottleEntry,
  generateVerifyCode: vi.fn().mockReturnValue("123456"),
  hashVerifyCode: vi.fn().mockReturnValue("hashed-code"),
  SMS_CODE_MAX_ATTEMPTS: 5,
}));

vi.mock("@/lib/points", () => ({ invalidateProfileCache: vi.fn() }));
vi.mock("@/lib/auth-logger", () => ({ logAuthEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  apiConsole: mocks.apiConsole,
}));

import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { PUT } from "@/app/api/oauth/phone/route";
import { POST } from "@/app/api/oauth/phone/send-code/route";

const mockAuthenticate = authenticateOAuthUserRequest as ReturnType<typeof vi.fn>;
const mockRateLimit = mocks.rateLimit;
const mockRevoke = mocks.revokeOtherSessions;
const mockUserUpdate = mocks.userUpdate;
const mockSmsCreate = mocks.smsCreate;

/** 简化版 OAuth 鉴权成功上下文（响应工厂带 no-store，与真实实现同形） */
function authOk() {
  return {
    ok: true as const,
    payload: { id: AUTH_CONTEXT.id, client_id: "client-1", scope: "openid phone", type: "access_token" },
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

const CODE_RECORD = { id: "code-1", codeHash: "hashed-code", ipAddress: "127.0.0.1" };

describe("OAuth 换绑手机号", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    mockAuthenticate.mockResolvedValue(authOk());
    mockRateLimit.mockResolvedValue({ success: true });
    mockRevoke.mockResolvedValue(undefined);
    mocks.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      "id" in args.where ? { id: "user-1", phone: "13800138000" } : null
    );
    mocks.smsFindFirst.mockResolvedValue(null);
    mocks.smsUpdateMany.mockResolvedValue({ count: 1 });
    mocks.smsCount.mockResolvedValue(0);
    mocks.smsCreate.mockResolvedValue({});
    mocks.verifyCode.mockReturnValue(true);
    mocks.sendLoginCode.mockResolvedValue({ success: true });
    mocks.sendPhoneChangedNotification.mockResolvedValue(undefined);
    mocks.simulateSmsSendLatency.mockResolvedValue(undefined);
    mocks.recordFakeSmsThrottleEntry.mockResolvedValue(undefined);
    mockUserUpdate.mockResolvedValue({});
  });

  describe("PUT /api/oauth/phone", () => {
    it("鉴权失败时直接返回鉴权响应，且请求 scope=phone", async () => {
      const denied = NextResponse.json(
        { error: "insufficient_scope", error_description: "需要 phone scope" },
        { status: 403 }
      );
      mockAuthenticate.mockResolvedValue({ ok: false, response: denied });

      const res = await PUT(
        createRequest("/api/oauth/phone", { newPhone: "13900139000", currentCode: "123456", newCode: "654321" }, "PUT")
      );
      expect(res.status).toBe(403);
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.anything(),
        "PUT",
        expect.objectContaining({ scope: "phone" })
      );
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });

    it("参数非法应返回 400 INVALID_PARAMS", async () => {
      const res = await PUT(
        createRequest("/api/oauth/phone", { newPhone: "12345", currentCode: "123456", newCode: "654321" }, "PUT")
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_PARAMS");
    });

    it("用户级限流触发应返回 429", async () => {
      mockRateLimit.mockResolvedValueOnce({ success: false });
      const res = await PUT(
        createRequest("/api/oauth/phone", { newPhone: "13900139000", currentCode: "123456", newCode: "654321" }, "PUT")
      );
      expect(res.status).toBe(429);
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });

    it("双验证码通过后更新手机号；无 Cookie 通道会话全撤（currentRefreshToken=null）", async () => {
      mocks.smsFindFirst.mockResolvedValue(CODE_RECORD);
      const res = await PUT(
        createRequest("/api/oauth/phone", { newPhone: "13900139000", currentCode: "123456", newCode: "654321" }, "PUT")
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      // OAuth 通道仅回传打码手机号
      expect(body.data.phone).toBe("139****9000");
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { phone: "13900139000" },
      });
      expect(mockRevoke).toHaveBeenCalledWith({ userId: "user-1", currentRefreshToken: null });
    });

    it("验证码错误应返回 400 CODE_INVALID，且不撤销会话", async () => {
      mocks.smsFindFirst.mockResolvedValue(CODE_RECORD);
      mocks.verifyCode.mockReturnValue(false);
      const res = await PUT(
        createRequest("/api/oauth/phone", { newPhone: "13900139000", currentCode: "000000", newCode: "654321" }, "PUT")
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("CODE_INVALID");
      expect(mockRevoke).not.toHaveBeenCalled();
    });

    it("新手机号已被注册且双验证码有效时应返回 PHONE_IN_USE（占用检查在双码校验之后）", async () => {
      mocks.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        "id" in args.where ? { id: "user-1", phone: "13800138000" } : { id: "user-2" }
      );
      mocks.smsFindFirst.mockResolvedValue(CODE_RECORD);

      const res = await PUT(
        createRequest("/api/oauth/phone", { newPhone: "13900139000", currentCode: "123456", newCode: "654321" }, "PUT")
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("PHONE_IN_USE");
      // 占用检查在事务之前：不核销验证码、不更新手机号、不撤销会话
      expect(mocks.smsUpdateMany).not.toHaveBeenCalled();
      expect(mockUserUpdate).not.toHaveBeenCalled();
      expect(mockRevoke).not.toHaveBeenCalled();
    });

    it("新手机号已被注册但验证码错误应返回 CODE_INVALID（不泄露占用状态）", async () => {
      mocks.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        "id" in args.where ? { id: "user-1", phone: "13800138000" } : { id: "user-2" }
      );
      mocks.smsFindFirst.mockResolvedValue(CODE_RECORD);
      mocks.verifyCode.mockReturnValue(false);

      const res = await PUT(
        createRequest("/api/oauth/phone", { newPhone: "13900139000", currentCode: "000000", newCode: "654321" }, "PUT")
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("CODE_INVALID");
    });
  });

  describe("POST /api/oauth/phone/send-code", () => {
    it("鉴权失败时直接返回鉴权响应", async () => {
      const denied = NextResponse.json({ error: "invalid_token" }, { status: 401 });
      mockAuthenticate.mockResolvedValue({ ok: false, response: denied });
      const res = await POST(createRequest("/api/oauth/phone/send-code", { target: "current" }));
      expect(res.status).toBe(401);
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.anything(),
        "POST",
        expect.objectContaining({ scope: "phone" })
      );
    });

    it("target=current 成功：写入 rebind-current 验证码并返回有效期", async () => {
      const res = await POST(createRequest("/api/oauth/phone/send-code", { target: "current" }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.expiresIn).toBe(300);
      expect(mockSmsCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ phone: "13800138000", type: "rebind-current" }),
      });
    });

    it("target=new 成功：写入 rebind-new 验证码", async () => {
      const res = await POST(
        createRequest("/api/oauth/phone/send-code", { target: "new", newPhone: "13900139000" })
      );
      expect(res.status).toBe(200);
      expect(mockSmsCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ phone: "13900139000", type: "rebind-new" }),
      });
    });

    it("新手机号已被注册应假发送：返回成功并写限流占位记录，不发真实短信（防枚举）", async () => {
      mocks.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        "id" in args.where ? { id: "user-1", phone: "13800138000" } : { id: "user-2" }
      );
      const res = await POST(
        createRequest("/api/oauth/phone/send-code", { target: "new", newPhone: "13900139000" })
      );
      const body = await res.json();

      // 与真实发送相同的响应（不返回 PHONE_IN_USE，避免 OAuth 通道成为注册状态探测通道）
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.expiresIn).toBe(300);
      // 写 used=true 限流占位记录（冷却/小时计数口径一致），但不发真实短信
      expect(mocks.recordFakeSmsThrottleEntry).toHaveBeenCalledWith(
        "13900139000",
        "rebind-new",
        "127.0.0.1",
        5
      );
      expect(mocks.sendLoginCode).not.toHaveBeenCalled();
      expect(mockSmsCreate).not.toHaveBeenCalled();
    });
  });
});

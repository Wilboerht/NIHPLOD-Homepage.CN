/**
 * OAuth 安全中心端点单元测试
 * GET/DELETE /api/oauth/security/devices
 * GET/DELETE /api/oauth/security/authorizations
 * GET/DELETE /api/oauth/security/identities
 * GET      /api/oauth/security/login-history
 *
 * 覆盖：未认证 401 / 缺 scope 403 / 设备列表当前标记 / 当前设备禁止下线 /
 * 当前应用禁止撤销 / 授权撤销级联 / 绑定列表与占位手机号解绑拦截 /
 * 登录历史透传 / 限流 429
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === Mock token-blacklist / jwt / sso-audit / logger ===
const mockIsBlacklisted = vi.fn();
vi.mock("@/lib/token-blacklist", () => ({
  isTokenBlacklisted: (...args: unknown[]) => mockIsBlacklisted(...args),
}));

const mockVerifyOAuthAccessToken = vi.fn();
vi.mock("@/lib/jwt", () => ({
  verifyOAuthAccessToken: (...args: unknown[]) => mockVerifyOAuthAccessToken(...args),
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn().mockResolvedValue(undefined),
  scheduleSsoEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// === Mock security 核心的外部依赖 ===
vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));
vi.mock("@/lib/auth-security", () => ({
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  hashIdentifier: (s: string) => `hmac-${s}`,
}));

// === Mock prisma ===
const prismaMock = vi.hoisted(() => {
  const m = {
    refreshToken: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    oAuthSession: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    oAuthClient: { findMany: vi.fn() },
    userConsent: { updateMany: vi.fn() },
    externalIdentity: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    loginAttempt: { findMany: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(m)),
  };
  return m;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// === Mock OAuth CORS ===
vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

// === Mock ID 校验（路由参数使用测试用固定 ID） ===
vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
}));

import { GET as devicesGET } from "../security/devices/route";
import { DELETE as deviceDELETE } from "../security/devices/[id]/route";
import { GET as authzGET } from "../security/authorizations/route";
import { DELETE as authzDELETE } from "../security/authorizations/[clientId]/route";
import { GET as identitiesGET } from "../security/identities/route";
import { DELETE as identityDELETE } from "../security/identities/[id]/route";
import { GET as historyGET } from "../security/login-history/route";
import { rateLimit } from "@/lib/ratelimit";

const mockRateLimit = vi.mocked(rateLimit);

function makeRequest(
  method: "GET" | "DELETE",
  path: string,
  opts: { authorized?: boolean } = {}
): NextRequest {
  const { authorized = true } = opts;
  return new NextRequest(new URL(`http://localhost${path}`), {
    method,
    ...(authorized ? { headers: { Authorization: "Bearer valid-token" } } : {}),
  } as never);
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

const activePayload = {
  id: "user-1",
  client_id: "wechat-mp-points",
  scope: "openid profile profile:write",
};

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

describe("/api/oauth/security/*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlacklisted.mockReturnValue(false);
    mockVerifyOAuthAccessToken.mockResolvedValue(activePayload);
    mockRateLimit.mockResolvedValue({ success: true } as never);
    prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prismaMock));
    // 账户状态守卫（guardOAuthUserActive）与业务逻辑共用 user.findUnique
    prismaMock.user.findUnique.mockResolvedValue({ phone: "13800138000", status: "ACTIVE" });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.update.mockResolvedValue({});
    prismaMock.refreshToken.findMany.mockResolvedValue([]);
    prismaMock.oAuthSession.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.userConsent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.externalIdentity.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("未认证返回 401", async () => {
    const res = await devicesGET(
      makeRequest("GET", "/api/oauth/security/devices", { authorized: false })
    );
    expect(res.status).toBe(401);
  });

  it("scope 不含 profile 返回 403 insufficient_scope", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid",
    });
    const res = await devicesGET(makeRequest("GET", "/api/oauth/security/devices"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
  });

  it("设备列表：最近活跃会话标记为当前设备", async () => {
    prismaMock.refreshToken.findMany.mockResolvedValue([
      {
        id: "d-new",
        deviceName: null,
        ipAddress: "1.2.3.4",
        createdAt: future,
        updatedAt: new Date("2026-10-17T12:00:00Z"),
        expiresAt: future,
        token: "hash-new",
        clientId: null,
      },
      {
        id: "d-old",
        deviceName: "iPhone",
        ipAddress: null,
        createdAt: future,
        updatedAt: new Date("2026-10-01T12:00:00Z"),
        expiresAt: future,
        token: "hash-old",
        clientId: null,
      },
    ]);

    const res = await devicesGET(makeRequest("GET", "/api/oauth/security/devices"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.devices).toHaveLength(2);
    expect(body.data.devices[0].isCurrent).toBe(true);
    expect(body.data.devices[0].deviceName).toBe("未知设备");
    expect(body.data.devices[1].isCurrent).toBe(false);
  });

  it("设备列表：优先把当前小程序 client 的最近活跃会话标记为当前设备", async () => {
    prismaMock.refreshToken.findMany.mockResolvedValue([
      {
        id: "d-web",
        deviceName: "MacBook",
        ipAddress: "1.1.1.1",
        createdAt: future,
        updatedAt: new Date("2026-10-17T12:00:00Z"),
        expiresAt: future,
        token: "hash-web",
        clientId: null,
      },
      {
        id: "d-mp",
        deviceName: null,
        ipAddress: "2.2.2.2",
        createdAt: future,
        updatedAt: new Date("2026-10-10T12:00:00Z"),
        expiresAt: future,
        token: "hash-mp",
        clientId: "wechat-mp-points",
      },
    ]);

    const res = await devicesGET(makeRequest("GET", "/api/oauth/security/devices"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const mp = body.data.devices.find((d: { id: string }) => d.id === "d-mp");
    const web = body.data.devices.find((d: { id: string }) => d.id === "d-web");
    expect(mp.isCurrent).toBe(true);
    expect(web.isCurrent).toBe(false);
  });

  it("强制下线非当前设备成功", async () => {
    prismaMock.refreshToken.findFirst.mockResolvedValueOnce({
      id: "d-old",
      token: "hash-old",
      clientId: null,
    });
    prismaMock.refreshToken.findMany.mockResolvedValue([
      { id: "d-old", clientId: null, updatedAt: new Date("2026-10-01T12:00:00Z") },
      { id: "d-new", clientId: null, updatedAt: new Date("2026-10-17T12:00:00Z") },
    ]);

    const res = await deviceDELETE(
      makeRequest("DELETE", "/api/oauth/security/devices/d-old"),
      context({ id: "cltarget1234567890abcde" })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.refreshToken.update).toHaveBeenCalled();
  });

  it("当前设备禁止强制下线（400 CURRENT_SESSION）", async () => {
    prismaMock.refreshToken.findFirst.mockResolvedValueOnce({
      id: "d-new",
      token: "hash-new",
      clientId: null,
    });
    prismaMock.refreshToken.findMany.mockResolvedValue([
      { id: "d-new", clientId: null, updatedAt: new Date("2026-10-17T12:00:00Z") },
    ]);

    const res = await deviceDELETE(
      makeRequest("DELETE", "/api/oauth/security/devices/d-new"),
      context({ id: "cltarget1234567890abcde" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("CURRENT_SESSION");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("当前小程序的其它设备禁止下线（400 CURRENT_CLIENT_DEVICE）", async () => {
    prismaMock.refreshToken.findFirst.mockResolvedValueOnce({
      id: "d-mp-other",
      token: "hash-mp-other",
      clientId: "wechat-mp-points",
    });
    prismaMock.refreshToken.findMany.mockResolvedValue([
      {
        id: "d-mp-current",
        clientId: "wechat-mp-points",
        updatedAt: new Date("2026-10-17T12:00:00Z"),
      },
      {
        id: "d-mp-other",
        clientId: "wechat-mp-points",
        updatedAt: new Date("2026-10-10T12:00:00Z"),
      },
    ]);

    const res = await deviceDELETE(
      makeRequest("DELETE", "/api/oauth/security/devices/d-mp-other"),
      context({ id: "cltarget1234567890abcde" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("CURRENT_CLIENT_DEVICE");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("授权列表：当前小程序标记 isCurrentClient", async () => {
    prismaMock.oAuthSession.findMany.mockResolvedValue([
      { clientId: "wechat-mp-points", scopes: ["openid", "profile"], createdAt: future },
      { clientId: "subsite", scopes: ["openid"], createdAt: future },
    ]);
    prismaMock.oAuthClient.findMany.mockResolvedValue([
      { clientId: "wechat-mp-points", name: "NIHPLOD 积分小程序" },
      { clientId: "subsite", name: "合作子站" },
    ]);

    const res = await authzGET(makeRequest("GET", "/api/oauth/security/authorizations"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.authorizations[0]).toEqual(
      expect.objectContaining({ clientId: "wechat-mp-points", isCurrentClient: true })
    );
    expect(body.data.authorizations[1].isCurrentClient).toBe(false);
  });

  it("禁止撤销当前小程序自身授权（400 CURRENT_CLIENT）", async () => {
    const res = await authzDELETE(
      makeRequest("DELETE", "/api/oauth/security/authorizations/wechat-mp-points"),
      context({ clientId: "wechat-mp-points" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("CURRENT_CLIENT");
    expect(prismaMock.oAuthSession.findMany).not.toHaveBeenCalled();
  });

  it("撤销其他应用授权：级联撤销 session/consent/token", async () => {
    prismaMock.oAuthSession.findMany.mockResolvedValue([{ id: "s1", sessionId: "sid-1" }]);

    const res = await authzDELETE(
      makeRequest("DELETE", "/api/oauth/security/authorizations/subsite"),
      context({ clientId: "subsite" })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.oAuthSession.updateMany).toHaveBeenCalled();
    expect(prismaMock.userConsent.updateMany).toHaveBeenCalled();
  });

  it("绑定列表：返回 provider 与 canUnbind", async () => {
    prismaMock.externalIdentity.findMany.mockResolvedValue([
      {
        id: "id-1",
        provider: "wechat_miniprogram",
        metadata: { nickname: "小N", mpClientId: "wechat-mp-points" },
        createdAt: future,
        updatedAt: future,
      },
    ]);

    const res = await identitiesGET(makeRequest("GET", "/api/oauth/security/identities"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.identities[0]).toEqual(
      expect.objectContaining({
        provider: "wechat_miniprogram",
        mpClientId: "wechat-mp-points",
        canUnbind: true,
      })
    );
  });

  it("占位手机号账号拒绝解绑（400 UNBIND_NOT_ALLOWED）", async () => {
    prismaMock.externalIdentity.findFirst.mockResolvedValue({
      id: "id-1",
      provider: "douyin",
      subjectId: "open-1",
      unionId: null,
    });
    prismaMock.user.findUnique.mockResolvedValue({ phone: "wx_placeholder", status: "ACTIVE" });

    const res = await identityDELETE(
      makeRequest("DELETE", "/api/oauth/security/identities/id-1"),
      context({ id: "clidentity1234567890abc" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("UNBIND_NOT_ALLOWED");
  });

  it("正常解绑第三方身份", async () => {
    prismaMock.externalIdentity.findFirst.mockResolvedValue({
      id: "id-1",
      provider: "douyin",
      subjectId: "open-1",
      unionId: null,
    });

    const res = await identityDELETE(
      makeRequest("DELETE", "/api/oauth/security/identities/id-1"),
      context({ id: "clidentity1234567890abc" })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.externalIdentity.deleteMany).toHaveBeenCalled();
  });

  it("登录历史透传（脱敏字段由核心处理）", async () => {
    prismaMock.loginAttempt.findMany.mockResolvedValue([
      {
        id: "a1",
        identifier: "hmac-13800138000",
        type: "sms",
        success: true,
        reason: null,
        ipAddress: "127.0.0.1",
        createdAt: future,
      },
    ]);

    const res = await historyGET(makeRequest("GET", "/api/oauth/security/login-history"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.attempts).toHaveLength(1);
    expect(body.data.attempts[0].type).toBe("sms");
  });

  it("触发限流返回 429", async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false } as never);
    const res = await deviceDELETE(
      makeRequest("DELETE", "/api/oauth/security/devices/d-old"),
      context({ id: "cltarget1234567890abcde" })
    );
    expect(res.status).toBe(429);
  });
});

/**
 * GET /api/auth/douyin/callback 路由测试
 * 覆盖：state 校验失败、用户拒绝授权、需绑定（新用户）、封禁 403 重定向、成功登录双写
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const txClient = {
    user: { update: vi.fn() },
    externalIdentity: { upsert: vi.fn() },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
      __tx: txClient,
    },
  };
});

vi.mock("@/lib/douyin", () => ({
  getDouyinOAuthToken: vi.fn(),
  getDouyinUserInfo: vi.fn(),
}));

vi.mock("@/lib/jwt", () => ({
  signUserToken: vi.fn(),
  signRefreshToken: vi.fn(),
  signWechatBindToken: vi.fn(),
}));

vi.mock("@/lib/auth-security", () => ({
  saveRefreshToken: vi.fn().mockResolvedValue(undefined),
  extractDeviceInfo: vi.fn().mockReturnValue({ deviceName: "test" }),
}));

vi.mock("@/lib/external-identity", () => ({
  findUserByIdentity: vi.fn(),
  findUserByUnionId: vi.fn(),
  upsertIdentity: vi.fn(),
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

import { getDouyinOAuthToken, getDouyinUserInfo } from "@/lib/douyin";
import { signUserToken, signRefreshToken, signWechatBindToken } from "@/lib/jwt";
import { findUserByIdentity, upsertIdentity } from "@/lib/external-identity";
import { checkUserStatus } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { GET } from "@/app/api/auth/douyin/callback/route";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockGetToken = getDouyinOAuthToken as ReturnType<typeof vi.fn>;
const mockGetUserInfo = getDouyinUserInfo as ReturnType<typeof vi.fn>;
const mockFindByIdentity = findUserByIdentity as ReturnType<typeof vi.fn>;
const mockUpsert = upsertIdentity as ReturnType<typeof vi.fn>;
const mockCheckStatus = checkUserStatus as ReturnType<typeof vi.fn>;

const NONCE = "nonce-123";
const VALID_STATE = Buffer.from(JSON.stringify({ redirect: "/", nonce: NONCE })).toString("base64url");

function createRequest(query: string, nonce?: string): NextRequest {
  return new NextRequest(new URL(`/api/auth/douyin/callback?${query}`, "http://localhost:3000"), {
    headers: nonce ? { cookie: `__Host-douyin_oauth_nonce=${nonce}` } : {},
  } as never);
}

describe("GET /api/auth/douyin/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
  });

  it("超限应返回 429", async () => {
    mockRateLimit.mockResolvedValue({ success: false });

    const res = await GET(createRequest("code=x", NONCE));

    expect(res.status).toBe(429);
  });

  it("state nonce 不匹配应重定向 INVALID_STATE", async () => {
    const res = await GET(createRequest(`code=x&state=${VALID_STATE}`, "other-nonce"));

    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("wechat_auth=error");
    expect(location).toContain("INVALID_STATE");
  });

  it("用户拒绝授权应重定向 DOUYIN_DENIED", async () => {
    const res = await GET(createRequest(`error=access_denied&state=${VALID_STATE}`, NONCE));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("DOUYIN_DENIED");
  });

  it("code 换取失败应重定向 INTERNAL_ERROR", async () => {
    mockGetToken.mockRejectedValue(new Error("invalid code"));

    const res = await GET(createRequest(`code=bad&state=${VALID_STATE}`, NONCE));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("INTERNAL_ERROR");
  });

  it("全新用户应重定向 binding_required 并设置绑定 Cookie", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "at", openId: "dy-openid", expiresIn: 7200 });
    mockGetUserInfo.mockResolvedValue({ openid: "dy-openid", unionid: "dy-union", nickname: "抖友" });
    mockFindByIdentity.mockResolvedValue(null);
    (signWechatBindToken as ReturnType<typeof vi.fn>).mockResolvedValue("bind-token-dy");

    const res = await GET(createRequest(`code=ok&state=${VALID_STATE}`, NONCE));
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(302);
    expect(location).toContain("wechat_auth=binding_required");
    // bindToken 载荷携带 douyin provider
    expect(signWechatBindToken).toHaveBeenCalledWith(
      expect.objectContaining({ openid: "dy-openid", provider: "douyin" })
    );
    // 绑定 Cookie 已设置
    const setCookie = res.headers.getSetCookie?.() ?? [];
    expect(setCookie.some((c) => c.includes("wechat_bind_token") && c.includes("bind-token-dy"))).toBe(true);
  });

  it("state redirect 为协议相对 URL 时应回落站内路径（防开放重定向）", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "at", openId: "dy-openid", expiresIn: 7200 });
    mockGetUserInfo.mockResolvedValue({ openid: "dy-openid" });
    mockFindByIdentity.mockResolvedValue(null);
    (signWechatBindToken as ReturnType<typeof vi.fn>).mockResolvedValue("bind-token-dy");

    const evilState = Buffer.from(
      JSON.stringify({ redirect: "//evil.com", nonce: NONCE })
    ).toString("base64url");
    const res = await GET(createRequest(`code=ok&state=${evilState}`, NONCE));
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(302);
    expect(location).not.toContain("evil.com");
    expect(location).toContain("wechat_auth=binding_required");
  });

  it("封禁账户应重定向错误页", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "at", openId: "dy-openid", expiresIn: 7200 });
    mockGetUserInfo.mockResolvedValue({ openid: "dy-openid" });
    mockFindByIdentity.mockResolvedValue({ id: "user-1", phone: "13800138000" });
    mockCheckStatus.mockResolvedValue({ valid: false, reason: "账号已被封禁" });

    const res = await GET(createRequest(`code=ok&state=${VALID_STATE}`, NONCE));
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(302);
    expect(location).toContain("wechat_auth=error");
    expect(location).toContain("DOUYIN_AUTH_FAILED");
  });

  it("已绑定真实账户应直接登录并双写 ExternalIdentity", async () => {
    mockGetToken.mockResolvedValue({ accessToken: "at", openId: "dy-openid", expiresIn: 7200 });
    mockGetUserInfo.mockResolvedValue({ openid: "dy-openid", unionid: "dy-union", nickname: "抖友" });
    mockFindByIdentity.mockResolvedValue({
      id: "user-1",
      phone: "13800138000",
      nickname: "测试用户",
      avatar: null,
    });
    mockCheckStatus.mockResolvedValue({ valid: true });
    (signUserToken as ReturnType<typeof vi.fn>).mockResolvedValue("access-token");
    (signRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue("refresh-token");

    const res = await GET(createRequest(`code=ok&state=${VALID_STATE}`, NONCE));
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(302);
    expect(location).toContain("wechat_auth=success");
    // 双 Token Cookie
    const setCookie = res.headers.getSetCookie?.() ?? [];
    expect(setCookie.some((c) => c.includes("access-token"))).toBe(true);
    expect(setCookie.some((c) => c.includes("refresh-token"))).toBe(true);
    // ExternalIdentity 双写：provider 为 douyin（事务内，尾参为 tx 客户端）
    expect(mockUpsert).toHaveBeenCalledWith(
      "user-1",
      "douyin",
      "dy-openid",
      "dy-union",
      { nickname: "抖友", avatar: null },
      expect.anything()
    );
  });
});

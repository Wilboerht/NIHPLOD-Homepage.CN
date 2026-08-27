/**
 * GET /api/auth/wechat/callback 路由测试（子站 exchange token Referer 泄露面）
 * 覆盖：重定向到子站且 URL query 携带一次性 exchange token 时，
 *       302 响应必须带 Referrer-Policy: no-referrer，
 *       防止浏览器跳转向子站第三方资源时通过 Referer 泄露含 token 的完整 URL
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: { findMany: vi.fn() },
    user: { findFirst: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
      cb({ user: { update: vi.fn().mockResolvedValue({}) } })
    ),
  },
}));

vi.mock("@/lib/jwt", () => ({
  signUserToken: vi.fn().mockResolvedValue("access-token"),
  signRefreshToken: vi.fn().mockResolvedValue("refresh-token"),
  signWechatBindToken: vi.fn().mockResolvedValue("bind-token"),
  signWechatExchangeToken: vi.fn().mockResolvedValue("exchange-token"),
}));

vi.mock("@/lib/wechat", () => ({
  getWechatOAuthToken: vi.fn().mockResolvedValue({
    accessToken: "wx-access-token",
    openid: "openid-123",
  }),
  getWechatUserInfo: vi.fn().mockResolvedValue({
    openid: "openid-123",
    unionid: "unionid-123",
    nickname: "微信用户",
    headimgurl: "https://example.com/avatar.png",
  }),
}));

vi.mock("@/lib/auth-security", () => ({
  saveRefreshToken: vi.fn().mockResolvedValue(undefined),
  extractDeviceInfo: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/external-identity", () => ({
  upsertIdentity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  checkUserStatus: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { WECHAT_NONCE_COOKIE_NAME } from "@/types/auth";
import { GET } from "@/app/api/auth/wechat/callback/route";

const mockOAuthClientFindMany = prisma.oAuthClient.findMany as ReturnType<typeof vi.fn>;
const mockUserFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;

const NONCE = "nonce-1";
const SUBSITE = "https://sub.example.com";

function createRequest(callback: string = SUBSITE): NextRequest {
  const state = Buffer.from(
    JSON.stringify({ nonce: NONCE, type: "open", callback })
  ).toString("base64url");
  const url = new URL("/api/auth/wechat/callback", "http://localhost:3000");
  url.searchParams.set("code", "wx-code");
  url.searchParams.set("state", state);
  return new NextRequest(url, {
    method: "GET",
    headers: { cookie: `${WECHAT_NONCE_COOKIE_NAME}=${NONCE}` },
  } as never);
}

describe("GET /api/auth/wechat/callback 子站 exchange token 重定向", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 子站域名在 OAuth client 白名单内（防开放重定向校验通过）
    mockOAuthClientFindMany.mockResolvedValue([{ redirectUris: [`${SUBSITE}/cb`] }]);
  });

  it("已有账户直接登录：302 携带 exchange token，且带 Referrer-Policy: no-referrer", async () => {
    mockUserFindFirst.mockResolvedValue({
      id: "user-1",
      phone: "13800138000",
      wechatUnionId: "unionid-123",
      nickname: "用户",
      avatar: null,
    });

    const res = await GET(createRequest());

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(SUBSITE);
    expect(location.searchParams.get("wechat_auth")).toBe("success");
    expect(location.searchParams.get("wechat_exchange_token")).toBe("exchange-token");
    // 关键断言：禁止通过 Referer 向子站第三方资源泄露含 token 的 URL
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("新用户需绑定：302 携带 exchange token，且带 Referrer-Policy: no-referrer", async () => {
    mockUserFindFirst.mockResolvedValue(null);

    const res = await GET(createRequest());

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(SUBSITE);
    expect(location.searchParams.get("wechat_auth")).toBe("binding_required");
    expect(location.searchParams.get("wechat_exchange_token")).toBe("exchange-token");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("官网场景（非子站）：不设 exchange token，无需 Referrer-Policy", async () => {
    mockUserFindFirst.mockResolvedValue({
      id: "user-1",
      phone: "13800138000",
      wechatUnionId: "unionid-123",
      nickname: "用户",
      avatar: null,
    });
    // 不在白名单的域名回退默认官网域名（防开放重定向），不再走子站 exchange token 通道
    const res = await GET(createRequest("https://evil-not-whitelisted.example.com"));

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("wechat_exchange_token")).toBeNull();
    expect(res.headers.get("referrer-policy")).toBeNull();
  });
});

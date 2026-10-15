/**
 * POST /api/auth/wechat/miniprogram-login 路由测试
 * 覆盖：限流 429、参数校验、code2session 失败、需绑定（新用户/占位账户）、封禁 403、成功登录三分支、
 *       phoneCode 一键登录（建号/已有账户绑定/换取失败降级/手机号格式异常）
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
      user: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      // 事务 mock：直接以 txClient 执行回调
      $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    },
  };
});

vi.mock("@/lib/wechat", () => ({
  code2session: vi.fn(),
  getMiniprogramPhone: vi.fn(),
}));

vi.mock("@/lib/miniprogram-clients", () => ({
  DEFAULT_MINIPROGRAM_CLIENT_ID: "wechat-mp-skin",
  resolveMiniprogramCredentials: vi.fn(),
}));

vi.mock("@/lib/jwt", () => ({
  signWechatBindToken: vi.fn(),
}));

vi.mock("@/lib/oauth-client", () => ({
  getOAuthClientByClientId: vi.fn(),
}));

vi.mock("@/lib/external-identity", () => ({
  findUserByIdentity: vi.fn(),
  findUserByUnionId: vi.fn(),
  upsertIdentity: vi.fn(),
}));

vi.mock("@/lib/wechat-binding", () => ({
  resolveWechatBinding: vi.fn(),
  issueOAuthTokens: vi.fn(),
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

import { prisma } from "@/lib/prisma";
import { code2session, getMiniprogramPhone } from "@/lib/wechat";
import { resolveMiniprogramCredentials } from "@/lib/miniprogram-clients";
import { signWechatBindToken } from "@/lib/jwt";
import { getOAuthClientByClientId } from "@/lib/oauth-client";
import { findUserByIdentity, findUserByUnionId, upsertIdentity } from "@/lib/external-identity";
import { resolveWechatBinding, issueOAuthTokens } from "@/lib/wechat-binding";
import { checkUserStatus } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { POST } from "@/app/api/auth/wechat/miniprogram-login/route";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockCode2session = code2session as ReturnType<typeof vi.fn>;
const mockGetPhone = getMiniprogramPhone as ReturnType<typeof vi.fn>;
const mockResolveCredentials = resolveMiniprogramCredentials as ReturnType<typeof vi.fn>;
const mockFindByIdentity = findUserByIdentity as ReturnType<typeof vi.fn>;
const mockFindByUnionId = findUserByUnionId as ReturnType<typeof vi.fn>;
const mockUpsert = upsertIdentity as ReturnType<typeof vi.fn>;
const mockCheckStatus = checkUserStatus as ReturnType<typeof vi.fn>;
const mockResolveBinding = resolveWechatBinding as ReturnType<typeof vi.fn>;
const mockIssueOAuthTokens = issueOAuthTokens as ReturnType<typeof vi.fn>;
const mockGetOAuthClient = getOAuthClientByClientId as ReturnType<typeof vi.fn>;
const mockUserFindFirst = (prisma.user as unknown as { findFirst: ReturnType<typeof vi.fn> })
  .findFirst;

const MP_CLIENT = {
  clientId: "wechat-mp-skin",
  scopes: ["openid", "profile", "phone", "membership", "profile:write", "birthday"],
  isActive: true,
  isPublic: true,
  accessTokenTtlSeconds: 28800,
};
const MP_OAUTH_OPTIONS = {
  clientId: "wechat-mp-skin",
  scope: "openid profile phone membership profile:write birthday",
  accessTokenTtlSeconds: 28800,
};

const DEFAULT_CREDENTIALS = { appId: "wx1234567890abcdef", appSecret: "s".repeat(32) };

function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/auth/wechat/miniprogram-login", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

describe("POST /api/auth/wechat/miniprogram-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
    mockGetOAuthClient.mockResolvedValue(MP_CLIENT);
    mockResolveCredentials.mockReturnValue(DEFAULT_CREDENTIALS);
    mockIssueOAuthTokens.mockResolvedValue({
      accessToken: "oauth-access-token",
      refreshToken: "oauth-refresh-token",
      expiresIn: 28800,
    });
  });

  it("超限应返回 429", async () => {
    mockRateLimit.mockResolvedValue({ success: false });

    const res = await POST(createRequest({ code: "wx-code" }));

    expect(res.status).toBe(429);
    expect(((await res.json()).error.code as string)).toBe("TOO_MANY_REQUESTS");
  });

  it("缺少 code 应返回 400", async () => {
    const res = await POST(createRequest({}));

    expect(res.status).toBe(400);
    expect(((await res.json()).error.code as string)).toBe("INVALID_PARAMS");
  });

  it("code2session 失败应返回 401 WECHAT_AUTH_FAILED", async () => {
    mockCode2session.mockRejectedValue(new Error("invalid code"));

    const res = await POST(createRequest({ code: "bad-code" }));

    expect(res.status).toBe(401);
    expect(((await res.json()).error.code as string)).toBe("WECHAT_AUTH_FAILED");
  });

  it("全新用户应返回 needBinding 与 bindToken", async () => {
    mockCode2session.mockResolvedValue({ openid: "openid-new", unionid: undefined, sessionKey: "sk" });
    mockFindByIdentity.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    (signWechatBindToken as ReturnType<typeof vi.fn>).mockResolvedValue("bind-token-1");

    const res = await POST(createRequest({ code: "wx-code" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.needBinding).toBe(true);
    expect(data.data.bindToken).toBe("bind-token-1");
    expect(signWechatBindToken).toHaveBeenCalledWith({
      openid: "openid-new",
      unionid: undefined,
      provider: "wechat_miniprogram",
      mpClientId: "wechat-mp-skin",
    });
  });

  it("占位账户应返回 needBinding", async () => {
    mockCode2session.mockResolvedValue({ openid: "openid-p", unionid: undefined, sessionKey: "sk" });
    mockFindByIdentity.mockResolvedValue({ id: "user-p", phone: "wx_placeholder_abc" });

    const res = await POST(createRequest({ code: "wx-code" }));
    const data = await res.json();

    expect(data.data.needBinding).toBe(true);
  });

  it("封禁账户应返回 403 ACCOUNT_DISABLED", async () => {
    mockCode2session.mockResolvedValue({ openid: "openid-1", unionid: undefined, sessionKey: "sk" });
    mockFindByIdentity.mockResolvedValue({ id: "user-1", phone: "13800138000" });
    mockCheckStatus.mockResolvedValue({ valid: false, reason: "账号已被封禁" });

    const res = await POST(createRequest({ code: "wx-code" }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("已绑定真实账户应直接登录并双写 ExternalIdentity", async () => {
    mockCode2session.mockResolvedValue({ openid: "openid-1", unionid: "union-1", sessionKey: "sk" });
    mockFindByIdentity.mockResolvedValue({
      id: "user-1",
      phone: "13800138000",
      nickname: "测试用户",
      avatar: null,
      wechatUnionId: "union-1",
    });
    mockCheckStatus.mockResolvedValue({ valid: true });

    const res = await POST(createRequest({ code: "wx-code" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.needBinding).toBe(false);
    // OAuth 口径签发：RS256 access token + expiresIn（= client accessTokenTtlSeconds）
    expect(data.data.accessToken).toBe("oauth-access-token");
    expect(data.data.refreshToken).toBe("oauth-refresh-token");
    expect(data.data.expiresIn).toBe(28800);
    expect(data.data.user.id).toBe("user-1");
    // 签发委托给 issueOAuthTokens，clientId/scope 固定，TTL 取自 OAuthClient 记录
    expect(mockIssueOAuthTokens).toHaveBeenCalledWith(
      { id: "user-1", phone: "13800138000" },
      MP_OAUTH_OPTIONS,
      expect.anything()
    );
    // 双写：provider 为 wechat_miniprogram（事务内，尾参为 tx 客户端）
    expect(mockUpsert).toHaveBeenCalledWith(
      "user-1",
      "wechat_miniprogram",
      "openid-1",
      "union-1",
      undefined,
      expect.anything()
    );
  });

  it("UnionID 聚合应跨 provider 匹配已有账户", async () => {
    mockCode2session.mockResolvedValue({ openid: "openid-mp", unionid: "union-9", sessionKey: "sk" });
    mockFindByIdentity.mockResolvedValue(null);
    mockFindByUnionId.mockResolvedValue({
      id: "user-9",
      phone: "13900139000",
      nickname: null,
      avatar: null,
      wechatUnionId: "union-9",
    });
    mockCheckStatus.mockResolvedValue({ valid: true });

    const res = await POST(createRequest({ code: "wx-code" }));
    const data = await res.json();

    expect(data.data.needBinding).toBe(false);
    expect(data.data.user.id).toBe("user-9");
    expect(mockUpsert).toHaveBeenCalledWith(
      "user-9",
      "wechat_miniprogram",
      "openid-mp",
      "union-9",
      undefined,
      expect.anything()
    );
  });

  describe("phoneCode 一键登录", () => {
    it("带 phoneCode 应调用 resolveWechatBinding 并签发 OAuth 双 Token", async () => {
      mockCode2session.mockResolvedValue({ openid: "openid-ot", unionid: "union-ot", sessionKey: "sk" });
      mockGetPhone.mockResolvedValue("13812340001");
      mockResolveBinding.mockResolvedValue({
        success: true,
        data: {
          user: { id: "user-ot", phone: "13812340001", nickname: "一键用户", avatar: null },
          accessToken: "at-ot",
          refreshToken: "rt-ot",
          expiresIn: 28800,
          passwordGenerated: true,
          message: "绑定成功",
        },
      });

      const res = await POST(createRequest({ code: "wx-code", phoneCode: "phone-code-1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.needBinding).toBe(false);
      expect(data.data.accessToken).toBe("at-ot");
      expect(data.data.refreshToken).toBe("rt-ot");
      expect(data.data.expiresIn).toBe(28800);
      expect(data.data.passwordGenerated).toBe(true);
      // 免短信通道：wxVerifiedPhone 与 phone 一致，允许自动密码；携带 OAuth 签发参数
      expect(mockResolveBinding).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: "13812340001",
          wxVerifiedPhone: "13812340001",
          allowAutoPassword: true,
          provider: "wechat_miniprogram",
          oauth: MP_OAUTH_OPTIONS,
          wechatInfo: expect.objectContaining({
            type: "wechat_bind",
            openid: "openid-ot",
            unionid: "union-ot",
            provider: "wechat_miniprogram",
          }),
        })
      );
      // 一键分支不应走常规身份查找/签发
      expect(mockFindByIdentity).not.toHaveBeenCalled();
      expect(mockIssueOAuthTokens).not.toHaveBeenCalled();
    });

    it("getMiniprogramPhone 失败应返回 400 PHONE_CODE_FAILED", async () => {
      mockCode2session.mockResolvedValue({ openid: "openid-f", unionid: undefined, sessionKey: "sk" });
      mockGetPhone.mockRejectedValue(new Error("getuserphonenumber failed: [40029] invalid code"));

      const res = await POST(createRequest({ code: "wx-code", phoneCode: "bad-phone-code" }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe("PHONE_CODE_FAILED");
      expect(mockResolveBinding).not.toHaveBeenCalled();
    });

    it("微信手机号格式异常应返回 400 PHONE_INVALID", async () => {
      mockCode2session.mockResolvedValue({ openid: "openid-i", unionid: undefined, sessionKey: "sk" });
      mockGetPhone.mockResolvedValue("00852-12345678");

      const res = await POST(createRequest({ code: "wx-code", phoneCode: "phone-code-2" }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe("PHONE_INVALID");
      expect(mockResolveBinding).not.toHaveBeenCalled();
    });

    it("resolveWechatBinding 返回封禁应透传 403", async () => {
      mockCode2session.mockResolvedValue({ openid: "openid-b", unionid: undefined, sessionKey: "sk" });
      mockGetPhone.mockResolvedValue("13812340002");
      mockResolveBinding.mockResolvedValue({
        success: false,
        code: "ACCOUNT_DISABLED",
        message: "账号已被封禁",
      });

      const res = await POST(createRequest({ code: "wx-code", phoneCode: "phone-code-3" }));
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe("ACCOUNT_DISABLED");
    });
  });

  describe("OAuth Client 配置缺失", () => {
    it("普通登录：client 不存在应返回 500 OAUTH_CLIENT_MISSING", async () => {
      mockGetOAuthClient.mockResolvedValue(null);
      mockCode2session.mockResolvedValue({ openid: "openid-1", unionid: undefined, sessionKey: "sk" });
      mockFindByIdentity.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        wechatUnionId: null,
      });
      mockCheckStatus.mockResolvedValue({ valid: true });

      const res = await POST(createRequest({ code: "wx-code" }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error.code).toBe("OAUTH_CLIENT_MISSING");
      expect(mockIssueOAuthTokens).not.toHaveBeenCalled();
    });

    it("phoneCode 一键登录：client 停用应返回 500 且不进入绑定流程", async () => {
      mockGetOAuthClient.mockResolvedValue({ ...MP_CLIENT, isActive: false });
      mockCode2session.mockResolvedValue({ openid: "openid-c", unionid: undefined, sessionKey: "sk" });
      mockGetPhone.mockResolvedValue("13812340003");

      const res = await POST(createRequest({ code: "wx-code", phoneCode: "phone-code-4" }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error.code).toBe("OAUTH_CLIENT_MISSING");
      expect(mockResolveBinding).not.toHaveBeenCalled();
    });

    it("client 不是 public 应返回 500（confidential client 的 refresh grant 会 401）", async () => {
      mockGetOAuthClient.mockResolvedValue({ ...MP_CLIENT, isPublic: false });
      mockCode2session.mockResolvedValue({ openid: "openid-1", unionid: undefined, sessionKey: "sk" });
      mockFindByIdentity.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        wechatUnionId: null,
      });
      mockCheckStatus.mockResolvedValue({ valid: true });

      const res = await POST(createRequest({ code: "wx-code" }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error.code).toBe("OAUTH_CLIENT_MISSING");
      expect(mockIssueOAuthTokens).not.toHaveBeenCalled();
    });

    it("client scopes 仅覆盖部分时应收窄签发 scope（MP_OAUTH_SCOPE ∩ client.scopes）", async () => {
      mockGetOAuthClient.mockResolvedValue({ ...MP_CLIENT, scopes: ["openid", "profile"] });
      mockCode2session.mockResolvedValue({ openid: "openid-1", unionid: undefined, sessionKey: "sk" });
      mockFindByIdentity.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        wechatUnionId: null,
      });
      mockCheckStatus.mockResolvedValue({ valid: true });

      const res = await POST(createRequest({ code: "wx-code" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.needBinding).toBe(false);
      expect(mockIssueOAuthTokens).toHaveBeenCalledWith(
        { id: "user-1", phone: "13800138000" },
        { ...MP_OAUTH_OPTIONS, scope: "openid profile" },
        expect.anything()
      );
    });

    it("client scopes 与所需 scope 无交集应返回 500 且不签发", async () => {
      mockGetOAuthClient.mockResolvedValue({ ...MP_CLIENT, scopes: ["email"] });
      mockCode2session.mockResolvedValue({ openid: "openid-1", unionid: undefined, sessionKey: "sk" });
      mockFindByIdentity.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        wechatUnionId: null,
      });
      mockCheckStatus.mockResolvedValue({ valid: true });

      const res = await POST(createRequest({ code: "wx-code" }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error.code).toBe("OAUTH_CLIENT_MISSING");
      expect(mockIssueOAuthTokens).not.toHaveBeenCalled();
    });

    it("phoneCode 一键登录：scope 交集为空应返回 500 且不进入绑定流程", async () => {
      mockGetOAuthClient.mockResolvedValue({ ...MP_CLIENT, scopes: [] });
      mockCode2session.mockResolvedValue({ openid: "openid-c", unionid: undefined, sessionKey: "sk" });
      mockGetPhone.mockResolvedValue("13812340004");

      const res = await POST(createRequest({ code: "wx-code", phoneCode: "phone-code-5" }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error.code).toBe("OAUTH_CLIENT_MISSING");
      expect(mockResolveBinding).not.toHaveBeenCalled();
    });
  });

  describe("多小程序客户端（clientId）", () => {
    it("缺省未传 clientId：按 wechat-mp-skin 解析凭证与 OAuth Client", async () => {
      mockCode2session.mockResolvedValue({
        openid: "openid-1",
        unionid: undefined,
        sessionKey: "sk",
      });
      mockFindByIdentity.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        wechatUnionId: null,
      });
      mockCheckStatus.mockResolvedValue({ valid: true });

      const res = await POST(createRequest({ code: "wx-code" }));

      expect(res.status).toBe(200);
      expect(mockResolveCredentials).toHaveBeenCalledWith("wechat-mp-skin");
      expect(mockCode2session).toHaveBeenCalledWith("wx-code", DEFAULT_CREDENTIALS);
      expect(mockGetOAuthClient).toHaveBeenCalledWith("wechat-mp-skin");
    });

    it("显式 clientId=wechat-mp-points：使用对应凭证与 OAuth Client 签发", async () => {
      const pointsCred = { appId: "wxabcdef1234567890", appSecret: "p".repeat(32) };
      mockResolveCredentials.mockReturnValue(pointsCred);
      mockGetOAuthClient.mockResolvedValue({ ...MP_CLIENT, clientId: "wechat-mp-points" });
      mockCode2session.mockResolvedValue({
        openid: "openid-p",
        unionid: undefined,
        sessionKey: "sk",
      });
      mockFindByIdentity.mockResolvedValue({
        id: "user-p",
        phone: "13800130000",
        nickname: null,
        avatar: null,
        wechatUnionId: null,
      });
      mockCheckStatus.mockResolvedValue({ valid: true });

      const res = await POST(createRequest({ code: "wx-code", clientId: "wechat-mp-points" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.needBinding).toBe(false);
      expect(mockResolveCredentials).toHaveBeenCalledWith("wechat-mp-points");
      expect(mockCode2session).toHaveBeenCalledWith("wx-code", pointsCred);
      expect(mockGetOAuthClient).toHaveBeenCalledWith("wechat-mp-points");
      expect(mockIssueOAuthTokens).toHaveBeenCalledWith(
        { id: "user-p", phone: "13800130000" },
        { ...MP_OAUTH_OPTIONS, clientId: "wechat-mp-points" },
        expect.anything()
      );
    });

    it("未配置的 clientId 应返回 400 UNKNOWN_CLIENT 且不调用 code2session", async () => {
      mockResolveCredentials.mockReturnValue(null);

      const res = await POST(createRequest({ code: "wx-code", clientId: "wechat-mp-unknown" }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe("UNKNOWN_CLIENT");
      expect(mockCode2session).not.toHaveBeenCalled();
    });

    it("needBinding 时 bindToken 载荷携带 mpClientId", async () => {
      mockResolveCredentials.mockReturnValue({
        appId: "wxabcdef1234567890",
        appSecret: "p".repeat(32),
      });
      mockCode2session.mockResolvedValue({
        openid: "openid-n",
        unionid: undefined,
        sessionKey: "sk",
      });
      mockFindByIdentity.mockResolvedValue(null);
      mockUserFindFirst.mockResolvedValue(null);
      (signWechatBindToken as ReturnType<typeof vi.fn>).mockResolvedValue("bind-token-2");

      const res = await POST(createRequest({ code: "wx-code", clientId: "wechat-mp-points" }));

      expect(res.status).toBe(200);
      expect(signWechatBindToken).toHaveBeenCalledWith({
        openid: "openid-n",
        unionid: undefined,
        provider: "wechat_miniprogram",
        mpClientId: "wechat-mp-points",
      });
    });
  });
});

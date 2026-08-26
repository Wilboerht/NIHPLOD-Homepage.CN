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

vi.mock("@/lib/jwt", () => ({
  signUserToken: vi.fn(),
  signRefreshToken: vi.fn(),
  signWechatBindToken: vi.fn(),
}));

vi.mock("@/lib/auth-security", () => ({
  saveRefreshToken: vi.fn(),
  extractDeviceInfo: vi.fn(),
}));

vi.mock("@/lib/external-identity", () => ({
  findUserByIdentity: vi.fn(),
  findUserByUnionId: vi.fn(),
  upsertIdentity: vi.fn(),
}));

vi.mock("@/lib/wechat-binding", () => ({
  resolveWechatBinding: vi.fn(),
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
import { signUserToken, signRefreshToken, signWechatBindToken } from "@/lib/jwt";
import { saveRefreshToken } from "@/lib/auth-security";
import { findUserByIdentity, findUserByUnionId, upsertIdentity } from "@/lib/external-identity";
import { resolveWechatBinding } from "@/lib/wechat-binding";
import { checkUserStatus } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { POST } from "@/app/api/auth/wechat/miniprogram-login/route";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockCode2session = code2session as ReturnType<typeof vi.fn>;
const mockGetPhone = getMiniprogramPhone as ReturnType<typeof vi.fn>;
const mockFindByIdentity = findUserByIdentity as ReturnType<typeof vi.fn>;
const mockFindByUnionId = findUserByUnionId as ReturnType<typeof vi.fn>;
const mockUpsert = upsertIdentity as ReturnType<typeof vi.fn>;
const mockCheckStatus = checkUserStatus as ReturnType<typeof vi.fn>;
const mockResolveBinding = resolveWechatBinding as ReturnType<typeof vi.fn>;
const mockUserFindFirst = (prisma.user as unknown as { findFirst: ReturnType<typeof vi.fn> })
  .findFirst;

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
    (signUserToken as ReturnType<typeof vi.fn>).mockResolvedValue("access-token");
    (signRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue("refresh-token");

    const res = await POST(createRequest({ code: "wx-code" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.needBinding).toBe(false);
    expect(data.data.accessToken).toBe("access-token");
    expect(data.data.refreshToken).toBe("refresh-token");
    expect(data.data.user.id).toBe("user-1");
    // 双写：provider 为 wechat_miniprogram（事务内，尾参为 tx 客户端）
    expect(mockUpsert).toHaveBeenCalledWith(
      "user-1",
      "wechat_miniprogram",
      "openid-1",
      "union-1",
      undefined,
      expect.anything()
    );
    expect(saveRefreshToken).toHaveBeenCalled();
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
    (signUserToken as ReturnType<typeof vi.fn>).mockResolvedValue("at");
    (signRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue("rt");

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
    it("带 phoneCode 应调用 resolveWechatBinding 并签发双 Token", async () => {
      mockCode2session.mockResolvedValue({ openid: "openid-ot", unionid: "union-ot", sessionKey: "sk" });
      mockGetPhone.mockResolvedValue("13812340001");
      mockResolveBinding.mockResolvedValue({
        success: true,
        data: {
          user: { id: "user-ot", phone: "13812340001", nickname: "一键用户", avatar: null },
          accessToken: "at-ot",
          refreshToken: "rt-ot",
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
      expect(data.data.passwordGenerated).toBe(true);
      // 免短信通道：wxVerifiedPhone 与 phone 一致，允许自动密码
      expect(mockResolveBinding).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: "13812340001",
          wxVerifiedPhone: "13812340001",
          allowAutoPassword: true,
          provider: "wechat_miniprogram",
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
      expect(signUserToken).not.toHaveBeenCalled();
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
});

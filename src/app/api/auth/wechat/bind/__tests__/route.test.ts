/**
 * POST /api/auth/wechat/bind 路由测试
 * 覆盖：body 携带 bindToken 的非浏览器通道豁免 CSRF；Cookie 通道无 CSRF 仍 403；
 *       bindToken + phoneCode 免短信通道（成功返回双 Token / 非 bindToken 通道拒绝 / 换取失败）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/wechat-binding", () => ({
  resolveWechatBinding: vi.fn(),
}));

vi.mock("@/lib/wechat", () => ({
  getMiniprogramPhone: vi.fn(),
}));

vi.mock("@/lib/jwt", () => ({
  verifyWechatBindToken: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn(),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn(),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

import { resolveWechatBinding } from "@/lib/wechat-binding";
import { getMiniprogramPhone } from "@/lib/wechat";
import { verifyWechatBindToken } from "@/lib/jwt";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { rateLimit } from "@/lib/ratelimit";
import { getClientIP } from "@/lib/client-ip";
import { POST } from "@/app/api/auth/wechat/bind/route";

const mockResolve = resolveWechatBinding as ReturnType<typeof vi.fn>;
const mockGetPhone = getMiniprogramPhone as ReturnType<typeof vi.fn>;
const mockVerifyBindToken = verifyWechatBindToken as ReturnType<typeof vi.fn>;
const mockValidateCSRF = validateCSRFToken as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;

function createRequest(body: unknown, options?: { headers?: Record<string, string> }): NextRequest {
  return new NextRequest(new URL("/api/auth/wechat/bind", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  } as never);
}

const validBody = {
  phone: "13800138000",
  code: "123456",
  allowAutoPassword: true,
};

describe("POST /api/auth/wechat/bind CSRF 豁免", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
    mockVerifyBindToken.mockResolvedValue({
      type: "wechat_bind",
      openid: "openid-1",
      provider: "wechat_miniprogram",
    });
    mockResolve.mockResolvedValue({
      success: true,
      data: {
        user: { id: "user-1", phone: "13800138000", nickname: null, avatar: null },
        accessToken: "at",
        refreshToken: "rt",
        passwordGenerated: true,
        message: "ok",
      },
    });
  });

  it("body 携带 bindToken（非浏览器通道）应豁免 CSRF 并正常绑定", async () => {
    const res = await POST(createRequest({ ...validBody, bindToken: "body-bind-token" }));
    const data = await res.json();

    expect(mockValidateCSRF).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // bindToken 通道（小程序）在 body 返回双 Token
    expect(data.data.accessToken).toBe("at");
    expect(data.data.refreshToken).toBe("rt");
    // provider 回退自 bindToken 载荷
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "wechat_miniprogram" })
    );
  });

  it("body provider 应被忽略，平台归属以 bindToken 载荷为准（防错标污染）", async () => {
    await POST(
      createRequest({ ...validBody, bindToken: "body-bind-token", provider: "wechat_open" })
    );

    // body 覆盖无效，provider 仍取载荷中的 wechat_miniprogram
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "wechat_miniprogram" })
    );
  });

  it("Cookie 通道（无 body bindToken）无 CSRF 应返回 403", async () => {
    mockValidateCSRF.mockReturnValue(false);
    (csrfForbiddenResponse as ReturnType<typeof vi.fn>).mockReturnValue(
      NextResponse.json(
        { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
        { status: 403 }
      )
    );

    const res = await POST(createRequest(validBody));
    const data = await res.json();

    expect(mockValidateCSRF).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe("CSRF_INVALID");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  describe("bindToken + phoneCode 免短信通道", () => {
    it("bindToken 通道带 phoneCode 应免短信绑定并在 body 返回双 Token", async () => {
      mockGetPhone.mockResolvedValue("13911112222");

      const res = await POST(
        createRequest({ bindToken: "body-bind-token", phoneCode: "phone-code-1" })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.accessToken).toBe("at");
      expect(data.data.refreshToken).toBe("rt");
      // 微信授权即归属证明：跳过短信，走 wxVerifiedPhone
      expect(mockResolve).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: "13911112222",
          wxVerifiedPhone: "13911112222",
          code: undefined,
        })
      );
    });

    it("phoneCode 换取失败应返回 400 PHONE_CODE_FAILED", async () => {
      mockGetPhone.mockRejectedValue(new Error("getuserphonenumber failed"));

      const res = await POST(
        createRequest({ bindToken: "body-bind-token", phoneCode: "bad-code" })
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe("PHONE_CODE_FAILED");
      expect(mockResolve).not.toHaveBeenCalled();
    });

    it("微信手机号格式异常应返回 400 PHONE_INVALID", async () => {
      mockGetPhone.mockResolvedValue("00852-12345678");

      const res = await POST(
        createRequest({ bindToken: "body-bind-token", phoneCode: "phone-code-2" })
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe("PHONE_INVALID");
    });

    it("非 bindToken 通道（Cookie）使用 phoneCode 应被拒绝", async () => {
      mockValidateCSRF.mockReturnValue(true);

      // Cookie 通道：bindToken 来自 Cookie（无 body bindToken）
      const res = await POST(
        createRequest(
          { phoneCode: "phone-code-3" },
          { headers: { Cookie: "__Host-wechat_bind_token=cookie-bind-token" } }
        )
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe("INVALID_PARAMS");
      expect(mockResolve).not.toHaveBeenCalled();
    });
  });
});

// NextResponse 需在 mock 之后导入仍可用（next/server 未被 mock）
import { NextResponse } from "next/server";

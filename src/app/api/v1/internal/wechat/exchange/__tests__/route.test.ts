import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  verifyWechatExchangeToken,
  releaseWechatExchangeToken,
  resolveWechatBinding,
  userFindFirst,
} = vi.hoisted(() => ({
  verifyWechatExchangeToken: vi.fn(),
  releaseWechatExchangeToken: vi.fn(),
  resolveWechatBinding: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: userFindFirst } },
}));
vi.mock("@/lib/jwt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jwt")>();
  return {
    ...actual,
    verifyWechatExchangeToken,
    releaseWechatExchangeToken,
    signUserToken: vi.fn(),
    signRefreshToken: vi.fn(),
  };
});
vi.mock("@/lib/wechat-binding", () => ({ resolveWechatBinding }));
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/internal-api", () => ({
  verifyInternalApiSignature: vi.fn().mockReturnValue({ project: "advisor" }),
  canonicalizeQuery: vi.fn().mockReturnValue(""),
  isProjectAllowed: vi.fn().mockReturnValue(true),
  isTimestampValid: vi.fn().mockReturnValue(true),
  checkAndRecordNonce: vi.fn().mockResolvedValue(true),
  hashRequestBody: vi.fn().mockResolvedValue("body-hash"),
}));
vi.mock("@/lib/request-body", async () => {
  const actual = await vi.importActual<typeof import("@/lib/request-body")>(
    "@/lib/request-body"
  );
  return {
    ...actual,
    readInternalApiBody: vi.fn(async (request: Request) => request.text()),
  };
});
vi.mock("@/lib/logger", () => ({
  apiConsole: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/auth-logger", () => ({ logAuthEvent: vi.fn() }));

import { POST } from "../route";

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://nihplod.cn/api/v1/internal/wechat/exchange", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-api-key": "key",
      "x-internal-api-signature": "signature",
      "x-internal-api-timestamp": "1",
      "x-internal-api-nonce": "nonce",
    },
    body: JSON.stringify(body),
  });
}

describe("微信 exchange 两阶段绑定", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyWechatExchangeToken.mockResolvedValue({
      type: "wechat_exchange",
      openid: "openid-1",
    });
    releaseWechatExchangeToken.mockResolvedValue(undefined);
    userFindFirst.mockResolvedValue(null);
  });

  it("bindingRequired 探测后释放占用，允许携带同一 token 继续绑定", async () => {
    const res = await POST(request({ wechatExchangeToken: "exchange-1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.bindingRequired).toBe(true);
    expect(releaseWechatExchangeToken).toHaveBeenCalledWith("exchange-1");
  });

  it("绑定业务失败时释放占用，允许修正验证码后重试", async () => {
    resolveWechatBinding.mockResolvedValue({
      success: false,
      code: "INVALID_CODE",
      message: "验证码错误",
    });
    const res = await POST(
      request({
        wechatExchangeToken: "exchange-2",
        phone: "13800138000",
        code: "123456",
      })
    );

    expect(res.status).toBe(400);
    expect(releaseWechatExchangeToken).toHaveBeenCalledWith("exchange-2");
  });

  it("绑定成功后保持已消费状态，不释放 token", async () => {
    resolveWechatBinding.mockResolvedValue({
      success: true,
      data: {
        user: { id: "user-1", phone: "13800138000", nickname: null, avatar: null },
        accessToken: "at",
        refreshToken: "rt",
        passwordGenerated: false,
        message: "绑定成功",
      },
    });
    const res = await POST(
      request({
        wechatExchangeToken: "exchange-3",
        phone: "13800138000",
        code: "123456",
      })
    );

    expect(res.status).toBe(200);
    expect(releaseWechatExchangeToken).not.toHaveBeenCalled();
  });
});

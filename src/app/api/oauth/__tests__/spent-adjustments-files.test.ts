/**
 * OAuth SpentAdjustments 凭证端点单元测试
 * POST /api/oauth/spent-adjustments/upload
 * GET  /api/oauth/spent-adjustments/image
 *
 * 覆盖：鉴权/scope/账户状态、上传成功与错误透传、图片 302（含 CORS 与 no-store）、
 * 归属校验错误透传
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockIsBlacklisted = vi.fn();
vi.mock("@/lib/token-blacklist", () => ({
  isTokenBlacklisted: (...args: unknown[]) => mockIsBlacklisted(...args),
}));

const mockVerifyOAuthAccessToken = vi.fn();
vi.mock("@/lib/jwt", () => ({
  verifyOAuthAccessToken: (...args: unknown[]) => mockVerifyOAuthAccessToken(...args),
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn(),
  scheduleSsoEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockUserFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) } },
}));

vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi
    .fn()
    .mockResolvedValue({ "Access-Control-Allow-Origin": "https://advisor.nihplod.cn" }),
}));

const mockUploadSpentProofFile = vi.fn();
const mockResolveSpentProofImage = vi.fn();
vi.mock("@/lib/spent-adjustment-files", () => ({
  uploadSpentProofFile: (...args: unknown[]) => mockUploadSpentProofFile(...args),
  resolveSpentProofImage: (...args: unknown[]) => mockResolveSpentProofImage(...args),
  isSpentProofMultipartTooLarge: vi.fn().mockReturnValue(false),
}));

import { POST as uploadPOST } from "../spent-adjustments/upload/route";
import { GET as imageGET } from "../spent-adjustments/image/route";

function authedToken(scope = "openid membership") {
  mockVerifyOAuthAccessToken.mockResolvedValue({
    id: "user-1",
    client_id: "test-client",
    scope,
  });
}

function uploadRequest(withFile = true, auth = true): NextRequest {
  const form = new FormData();
  if (withFile) {
    form.append("file", new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" }));
  }
  return new NextRequest(new URL("http://localhost/api/oauth/spent-adjustments/upload"), {
    method: "POST",
    body: form,
    headers: auth ? { Authorization: "Bearer valid-token" } : {},
  } as never);
}

function imageRequest(auth = true): NextRequest {
  return new NextRequest(
    new URL("http://localhost/api/oauth/spent-adjustments/image?key=spent-adjustments/a.webp"),
    { headers: auth ? { Authorization: "Bearer valid-token" } : {} }
  );
}

describe("/api/oauth/spent-adjustments/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlacklisted.mockReturnValue(false);
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ status: "ACTIVE" });
  });

  it("缺少 Authorization 返回 401", async () => {
    const res = await uploadPOST(uploadRequest(true, false));
    expect(res.status).toBe(401);
  });

  it("scope 不含 membership 返回 403", async () => {
    authedToken("openid profile");
    const res = await uploadPOST(uploadRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
  });

  it("账户非 ACTIVE 返回 403 account_disabled", async () => {
    authedToken();
    mockUserFindUnique.mockResolvedValue({ status: "FROZEN" });
    const res = await uploadPOST(uploadRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("account_disabled");
  });

  it("上传成功返回 { success, data }", async () => {
    authedToken();
    mockUploadSpentProofFile.mockResolvedValue({
      ok: true,
      url: "spent-adjustments/x.webp",
      private: true,
    });
    const res = await uploadPOST(uploadRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ url: "spent-adjustments/x.webp", private: true });
    expect(mockUploadSpentProofFile).toHaveBeenCalledTimes(1);
  });

  it("上传校验失败按错误状态透传", async () => {
    authedToken();
    mockUploadSpentProofFile.mockResolvedValue({
      ok: false,
      status: 400,
      code: "INVALID_FILE",
      message: "凭证仅支持图片格式",
    });
    const res = await uploadPOST(uploadRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FILE");
  });

  it("缺少文件返回 400 NO_FILE（不调用上传逻辑）", async () => {
    authedToken();
    const res = await uploadPOST(uploadRequest(false));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("NO_FILE");
    expect(mockUploadSpentProofFile).not.toHaveBeenCalled();
  });
});

describe("/api/oauth/spent-adjustments/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlacklisted.mockReturnValue(false);
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ status: "ACTIVE" });
  });

  it("归属校验通过后 302 到签名地址，并带 CORS 与 no-store", async () => {
    authedToken();
    mockResolveSpentProofImage.mockResolvedValue({
      ok: true,
      signedUrl: "https://bucket.oss-cn.aliyuncs.com/x.webp?Signature=abc",
    });

    const res = await imageGET(imageRequest());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://bucket.oss-cn.aliyuncs.com/x.webp?Signature=abc"
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://advisor.nihplod.cn");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockResolveSpentProofImage).toHaveBeenCalledWith(
      "user-1",
      "spent-adjustments/a.webp"
    );
  });

  it("图片不存在按错误状态透传", async () => {
    authedToken();
    mockResolveSpentProofImage.mockResolvedValue({
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "图片不存在",
    });
    const res = await imageGET(imageRequest());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });

  it("账户非 ACTIVE 返回 403 account_disabled", async () => {
    authedToken();
    mockUserFindUnique.mockResolvedValue({ status: "FROZEN" });
    const res = await imageGET(imageRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("account_disabled");
  });
});

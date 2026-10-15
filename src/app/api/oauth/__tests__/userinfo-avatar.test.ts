/**
 * OAuth UserInfo 头像上传端点单元测试
 * POST /api/oauth/userinfo/avatar
 *
 * 覆盖：鉴权 401 / scope 403 / M2M 403 / 账户状态、文件缺失、真实类型校验、
 *       大小限制、成功返回绝对 URL（本地相对路径补全）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

const mockValidateFileBuffer = vi.fn();
const mockProcessAndSaveImage = vi.fn();
vi.mock("@/lib/upload", () => ({
  validateFileBuffer: (...args: unknown[]) => mockValidateFileBuffer(...args),
  processAndSaveImage: (...args: unknown[]) => mockProcessAndSaveImage(...args),
}));

import { POST } from "../userinfo/avatar/route";

function authedToken(scope = "openid profile:write") {
  mockVerifyOAuthAccessToken.mockResolvedValue({
    id: "user-1",
    client_id: "wechat-mp-points",
    scope,
  });
}

function uploadRequest(options?: {
  withFile?: boolean;
  auth?: boolean;
  size?: number;
}): NextRequest {
  const form = new FormData();
  if (options?.withFile ?? true) {
    const bytes = new Uint8Array(options?.size ?? 4);
    form.append("file", new File([bytes], "avatar.jpg", { type: "image/jpeg" }));
  }
  return new NextRequest(new URL("http://localhost/api/oauth/userinfo/avatar"), {
    method: "POST",
    body: form,
    headers: options?.auth === false ? {} : { Authorization: "Bearer valid-token" },
  } as never);
}

describe("POST /api/oauth/userinfo/avatar", () => {
  const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlacklisted.mockReturnValue(false);
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ status: "ACTIVE" });
    mockValidateFileBuffer.mockResolvedValue({ valid: true, detectedType: "image/jpeg" });
    mockProcessAndSaveImage.mockResolvedValue({
      url: "https://cdn.example.com/avatars/a.webp",
      filename: "a.webp",
      size: 100,
    });
  });

  afterEach(() => {
    if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
  });

  it("缺少 Authorization 返回 401", async () => {
    const res = await POST(uploadRequest({ auth: false }));
    expect(res.status).toBe(401);
  });

  it("scope 不含 profile:write 返回 403", async () => {
    authedToken("openid profile membership");
    const res = await POST(uploadRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
    expect(mockProcessAndSaveImage).not.toHaveBeenCalled();
  });

  it("M2M token 返回 403 且不进入上传流程", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "client:abc",
      client_id: "wechat-mp-points",
      scope: "profile:write",
    });
    const res = await POST(uploadRequest());
    expect(res.status).toBe(403);
    expect(mockProcessAndSaveImage).not.toHaveBeenCalled();
  });

  it("账户非 ACTIVE 返回 403 account_disabled", async () => {
    authedToken();
    mockUserFindUnique.mockResolvedValue({ status: "BANNED" });
    const res = await POST(uploadRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("account_disabled");
  });

  it("缺少文件返回 400 NO_FILE", async () => {
    authedToken();
    const res = await POST(uploadRequest({ withFile: false }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("NO_FILE");
  });

  it("非图片真实类型（伪装图片的 PDF）返回 400", async () => {
    authedToken();
    mockValidateFileBuffer.mockResolvedValue({ valid: true, detectedType: "application/pdf" });
    const res = await POST(uploadRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FILE_TYPE");
    expect(mockProcessAndSaveImage).not.toHaveBeenCalled();
  });

  it("文件超过 5MB 返回 413", async () => {
    authedToken();
    const res = await POST(uploadRequest({ size: 5 * 1024 * 1024 + 1 }));
    expect(res.status).toBe(413);
    expect(mockProcessAndSaveImage).not.toHaveBeenCalled();
  });

  it("上传成功返回绝对 URL（本地存储相对路径自动补全）", async () => {
    authedToken();
    process.env.NEXT_PUBLIC_APP_URL = "https://nihplod.cn";
    mockProcessAndSaveImage.mockResolvedValue({
      url: "/uploads/avatars/a.webp",
      filename: "a.webp",
      size: 100,
    });

    const res = await POST(uploadRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toBe("https://nihplod.cn/uploads/avatars/a.webp");
    expect(mockProcessAndSaveImage).toHaveBeenCalledWith(
      expect.any(Buffer),
      "avatar-user-1",
      "avatars"
    );
  });
});

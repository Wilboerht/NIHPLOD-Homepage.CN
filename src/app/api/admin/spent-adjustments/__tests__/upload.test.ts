/**
 * 代客补录凭证上传 API 测试（管理端）
 * POST /api/admin/spent-adjustments/upload - 权限、CSRF、目标用户校验与错误透传
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    new Response(JSON.stringify({ success: false, error: { code: "CSRF_INVALID" } }), {
      status: 403,
    }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
  default: {
    user: { findUnique: vi.fn() },
  },
}));

const mockUploadSpentProofFile = vi.fn();
vi.mock("@/lib/spent-adjustment-files", () => ({
  uploadSpentProofFile: (...args: unknown[]) => mockUploadSpentProofFile(...args),
  isSpentProofMultipartTooLarge: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { verifyAuth } from "@/lib/auth";
import { validateCSRFToken } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/admin/spent-adjustments/upload/route";

const mockVerifyAuth = verifyAuth as ReturnType<typeof vi.fn>;
const mockValidateCSRF = validateCSRFToken as ReturnType<typeof vi.fn>;
const mockFindUser = prisma.user.findUnique as ReturnType<typeof vi.fn>;

const USER_ID = "cjld2cjxh0000qzrmn831i7rn";

function uploadRequest(options?: { withFile?: boolean; userId?: string }): NextRequest {
  const form = new FormData();
  if (options?.withFile !== false) {
    form.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" })
    );
  }
  form.append("userId", options?.userId ?? USER_ID);
  return new NextRequest(new URL("http://localhost/api/admin/spent-adjustments/upload"), {
    method: "POST",
    body: form,
  } as never);
}

describe("POST /api/admin/spent-adjustments/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue({
      id: "admin-1",
      role: "support",
      name: "客服A",
      email: "support@example.com",
    });
    mockValidateCSRF.mockReturnValue(true);
    mockFindUser.mockResolvedValue({ status: "ACTIVE" });
    mockUploadSpentProofFile.mockResolvedValue({
      ok: true,
      url: `private-local:spent-adjustments/${USER_ID}/x.webp`,
      private: true,
    });
  });

  it("未登录返回 401", async () => {
    mockVerifyAuth.mockResolvedValue(null);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(401);
    expect(mockUploadSpentProofFile).not.toHaveBeenCalled();
  });

  it("无 spent:create 权限返回 403", async () => {
    mockVerifyAuth.mockResolvedValue({ id: "admin-2", role: "finance" });

    const res = await POST(uploadRequest());

    expect(res.status).toBe(403);
    expect(mockUploadSpentProofFile).not.toHaveBeenCalled();
  });

  it("CSRF 校验失败返回 403", async () => {
    mockValidateCSRF.mockReturnValue(false);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(403);
  });

  it("缺少文件返回 400", async () => {
    const res = await POST(uploadRequest({ withFile: false }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("NO_FILE");
  });

  it("用户 ID 非法返回 400", async () => {
    const res = await POST(uploadRequest({ userId: "bad-id" }));

    expect(res.status).toBe(400);
    expect(mockUploadSpentProofFile).not.toHaveBeenCalled();
  });

  it("目标用户不存在返回 404", async () => {
    mockFindUser.mockResolvedValue(null);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(404);
    expect(mockUploadSpentProofFile).not.toHaveBeenCalled();
  });

  it("目标用户非正常状态返回 409", async () => {
    mockFindUser.mockResolvedValue({ status: "BANNED" });

    const res = await POST(uploadRequest());

    expect(res.status).toBe(409);
    expect(mockUploadSpentProofFile).not.toHaveBeenCalled();
  });

  it("上传成功：凭证按目标用户前缀存储", async () => {
    const res = await POST(uploadRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockUploadSpentProofFile).toHaveBeenCalledWith(expect.any(File), USER_ID);
  });

  it("存储层错误按状态透传", async () => {
    mockUploadSpentProofFile.mockResolvedValue({
      ok: false,
      status: 400,
      code: "INVALID_FILE",
      message: "不支持的文件类型",
    });

    const res = await POST(uploadRequest());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FILE");
  });
});

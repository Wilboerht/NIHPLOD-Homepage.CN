/**
 * 消费补录凭证端点单元测试（主站会话路由）
 * POST /api/user/spent-adjustments/upload
 * GET  /api/user/spent-adjustments/image
 *
 * 路由为薄封装：这里覆盖会话鉴权、响应契约与错误透传，
 * 上传/签名核心逻辑由 spent-adjustment-files 单测/集成覆盖。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockVerifyUserAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) =>
    (req: NextRequest) =>
      handler(req, { id: "user-1" }),
  verifyUserAuth: (...args: unknown[]) => mockVerifyUserAuth(...args),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockUploadSpentProofFile = vi.fn();
const mockResolveSpentProofImage = vi.fn();
vi.mock("@/lib/spent-adjustment-files", () => ({
  uploadSpentProofFile: (...args: unknown[]) => mockUploadSpentProofFile(...args),
  resolveSpentProofImage: (...args: unknown[]) => mockResolveSpentProofImage(...args),
  isSpentProofMultipartTooLarge: vi.fn().mockReturnValue(false),
}));

import { POST as uploadPOST } from "../upload/route";
import { GET as imageGET } from "../image/route";

function uploadRequest(withFile = true): NextRequest {
  const form = new FormData();
  if (withFile) {
    form.append("file", new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" }));
  }
  return new NextRequest(new URL("http://localhost/api/user/spent-adjustments/upload"), {
    method: "POST",
    body: form,
  } as never);
}

function imageRequest(): NextRequest {
  return new NextRequest(
    new URL("http://localhost/api/user/spent-adjustments/image?key=spent-adjustments/a.webp")
  );
}

describe("POST /api/user/spent-adjustments/upload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("上传成功返回 { success, data }", async () => {
    mockUploadSpentProofFile.mockResolvedValue({
      ok: true,
      url: "spent-adjustments/x.webp",
      private: true,
    });
    const res = await uploadPOST(uploadRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { url: "spent-adjustments/x.webp", private: true },
    });
  });

  it("缺少文件返回 400 NO_FILE", async () => {
    const res = await uploadPOST(uploadRequest(false));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("NO_FILE");
  });

  it("校验失败按错误状态透传", async () => {
    mockUploadSpentProofFile.mockResolvedValue({
      ok: false,
      status: 400,
      code: "INVALID_FILE",
      message: "不支持的文件类型",
    });
    const res = await uploadPOST(uploadRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FILE");
  });
});

describe("GET /api/user/spent-adjustments/image", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未登录返回 401", async () => {
    mockVerifyUserAuth.mockResolvedValue(null);
    const res = await imageGET(imageRequest());
    expect(res.status).toBe(401);
  });

  it("归属校验通过后 302 到签名地址", async () => {
    mockVerifyUserAuth.mockResolvedValue({ id: "user-1" });
    mockResolveSpentProofImage.mockResolvedValue({
      ok: true,
      signedUrl: "https://bucket.oss-cn.aliyuncs.com/x.webp?Signature=abc",
    });
    const res = await imageGET(imageRequest());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://bucket.oss-cn.aliyuncs.com/x.webp?Signature=abc"
    );
  });

  it("图片不存在按错误状态透传", async () => {
    mockVerifyUserAuth.mockResolvedValue({ id: "user-1" });
    mockResolveSpentProofImage.mockResolvedValue({
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "图片不存在",
    });
    const res = await imageGET(imageRequest());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

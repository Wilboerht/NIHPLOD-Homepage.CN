/**
 * 消费补录凭证文件助手单元测试（spent-adjustment-files）
 *
 * 覆盖：上传校验分支（声明类型/大小、magic bytes、仅图片）、私有 bucket 与公开回退、
 * 图片归属校验与签名失败分支。路由层（会话/OAuth）另有单独测试。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  validateUploadServer: vi.fn(),
  validateFileBuffer: vi.fn(),
  processAndSaveImage: vi.fn(),
  processImageToWebp: vi.fn(),
  isPrivateBucketConfigured: vi.fn(),
  uploadToPrivateOSS: vi.fn(),
  signPrivateObjectUrl: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/upload", () => ({
  validateUploadServer: mocks.validateUploadServer,
  validateFileBuffer: mocks.validateFileBuffer,
  processAndSaveImage: mocks.processAndSaveImage,
  processImageToWebp: mocks.processImageToWebp,
}));

vi.mock("@/lib/ali-oss", () => ({
  isPrivateBucketConfigured: mocks.isPrivateBucketConfigured,
  uploadToPrivateOSS: mocks.uploadToPrivateOSS,
  signPrivateObjectUrl: mocks.signPrivateObjectUrl,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { spentAdjustmentApplication: { findFirst: mocks.findFirst } },
}));

import { uploadSpentProofFile, resolveSpentProofImage } from "../spent-adjustment-files";

function makeFile(type = "image/jpeg", name = "receipt.jpg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("uploadSpentProofFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateUploadServer.mockReturnValue({ valid: true });
    mocks.validateFileBuffer.mockResolvedValue({ valid: true, detectedType: "image/jpeg" });
    mocks.isPrivateBucketConfigured.mockReturnValue(false);
  });

  it("声明类型/大小校验失败返回 400 INVALID_FILE", async () => {
    mocks.validateUploadServer.mockReturnValue({ valid: false, error: "不支持的文件类型" });
    const result = await uploadSpentProofFile(makeFile());
    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "INVALID_FILE",
      message: "不支持的文件类型",
    });
  });

  it("magic bytes 校验失败返回 400", async () => {
    mocks.validateFileBuffer.mockResolvedValue({ valid: false, error: "无法识别文件类型" });
    const result = await uploadSpentProofFile(makeFile());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_FILE");
  });

  it("检测结果非图片（如 PDF）返回 400", async () => {
    mocks.validateFileBuffer.mockResolvedValue({ valid: true, detectedType: "application/pdf" });
    const result = await uploadSpentProofFile(makeFile("application/pdf", "a.pdf"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("仅支持图片");
  });

  it("私有 bucket 配置时返回 objectName 且标记 private", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    mocks.processImageToWebp.mockResolvedValue(Buffer.from("webp"));
    mocks.uploadToPrivateOSS.mockResolvedValue({ objectName: "spent-adjustments/x.webp" });

    const result = await uploadSpentProofFile(makeFile());
    expect(result).toEqual({ ok: true, url: "spent-adjustments/x.webp", private: true });

    const [processed, objectName, mime] = mocks.uploadToPrivateOSS.mock.calls[0];
    expect(processed).toBeInstanceOf(Buffer);
    expect(String(objectName)).toMatch(/^spent-adjustments\/.+\.webp$/);
    expect(mime).toBe("image/webp");
  });

  it("未配置私有 bucket 时回退公开管线（private=false）", async () => {
    mocks.processAndSaveImage.mockResolvedValue({ url: "/uploads/spent-adjustments/a.webp" });

    const result = await uploadSpentProofFile(makeFile());
    expect(result).toEqual({
      ok: true,
      url: "/uploads/spent-adjustments/a.webp",
      private: false,
    });

    const [, , folder, options] = mocks.processAndSaveImage.mock.calls[0];
    expect(folder).toBe("spent-adjustments");
    expect(options).toEqual({ generateThumbnail: false, generateBlur: false });
  });
});

describe("resolveSpentProofImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("key 缺失或超长返回 400", async () => {
    const result = await resolveSpentProofImage("user-1", "");
    expect(result).toEqual({ ok: false, status: 400, code: "INVALID_PARAMS", message: "参数错误" });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("不属于当前用户的申请返回 404", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const result = await resolveSpentProofImage("user-1", "spent-adjustments/a.webp");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });

  it("私有 bucket 未配置（签名失败）返回 404 NOT_CONFIGURED", async () => {
    mocks.findFirst.mockResolvedValue({ id: "app-1" });
    mocks.signPrivateObjectUrl.mockReturnValue(null);
    const result = await resolveSpentProofImage("user-1", "spent-adjustments/a.webp");
    expect(result).toEqual({
      ok: false,
      status: 404,
      code: "NOT_CONFIGURED",
      message: "图片服务未配置",
    });
  });

  it("归属校验通过返回签名地址", async () => {
    mocks.findFirst.mockResolvedValue({ id: "app-1" });
    mocks.signPrivateObjectUrl.mockReturnValue("https://bucket.oss-cn.aliyuncs.com/x.webp?Signature=a");

    const result = await resolveSpentProofImage("user-1", "spent-adjustments/a.webp");
    expect(result).toEqual({
      ok: true,
      signedUrl: "https://bucket.oss-cn.aliyuncs.com/x.webp?Signature=a",
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", images: { has: "spent-adjustments/a.webp" } },
      select: { id: true },
    });
  });
});

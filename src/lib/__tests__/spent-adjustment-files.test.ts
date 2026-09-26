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

import {
  uploadSpentProofFile,
  resolveSpentProofImage,
  isSpentProofMultipartTooLarge,
} from "../spent-adjustment-files";

function makeFile(type = "image/jpeg", name = "receipt.jpg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

const LEGACY_KEY = "spent-adjustments/123e4567-e89b-42d3-a456-426614174000.webp";
const OWN_KEY = "spent-adjustments/user-1/123e4567-e89b-42d3-a456-426614174000.webp";
const OTHER_USER_KEY = "spent-adjustments/user-2/123e4567-e89b-42d3-a456-426614174000.webp";

describe("isSpentProofMultipartTooLarge", () => {
  it("无 Content-Length（chunked）不拦截，交由 file.size 校验", () => {
    expect(isSpentProofMultipartTooLarge(null)).toBe(false);
  });
  it("超过粗筛上限返回 true", () => {
    expect(isSpentProofMultipartTooLarge(String(13 * 1024 * 1024))).toBe(true);
    expect(isSpentProofMultipartTooLarge(String(5 * 1024 * 1024))).toBe(false);
  });
});

describe("uploadSpentProofFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateUploadServer.mockReturnValue({ valid: true });
    mocks.validateFileBuffer.mockResolvedValue({ valid: true, detectedType: "image/jpeg" });
    mocks.isPrivateBucketConfigured.mockReturnValue(false);
  });

  it("声明类型/大小校验失败返回 400 INVALID_FILE", async () => {
    mocks.validateUploadServer.mockReturnValue({ valid: false, error: "不支持的文件类型" });
    const result = await uploadSpentProofFile(makeFile(), "user-1");
    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "INVALID_FILE",
      message: "不支持的文件类型",
    });
  });

  it("magic bytes 校验失败返回 400", async () => {
    mocks.validateFileBuffer.mockResolvedValue({ valid: false, error: "无法识别文件类型" });
    const result = await uploadSpentProofFile(makeFile(), "user-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_FILE");
  });

  it("检测结果非图片（如 PDF）返回 400", async () => {
    mocks.validateFileBuffer.mockResolvedValue({ valid: true, detectedType: "application/pdf" });
    const result = await uploadSpentProofFile(makeFile("application/pdf", "a.pdf"), "user-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("仅支持图片");
  });

  it("私有 bucket 配置时返回含 userId 前缀的 objectName 且标记 private", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    mocks.processImageToWebp.mockResolvedValue(Buffer.from("webp"));
    mocks.uploadToPrivateOSS.mockResolvedValue({ objectName: "spent-adjustments/x.webp" });

    const result = await uploadSpentProofFile(makeFile(), "user-1");
    expect(result).toEqual({ ok: true, url: "spent-adjustments/x.webp", private: true });

    const [processed, objectName, mime] = mocks.uploadToPrivateOSS.mock.calls[0];
    expect(processed).toBeInstanceOf(Buffer);
    // 归属由对象名前缀权威判定
    expect(String(objectName)).toMatch(
      /^spent-adjustments\/user-1\/[0-9a-f-]{36}\.webp$/i
    );
    expect(mime).toBe("image/webp");
  });

  it("非生产环境未配置私有 bucket 时回退公开管线（private=false）", async () => {
    mocks.processAndSaveImage.mockResolvedValue({ url: "/uploads/spent-adjustments/a.webp" });

    const result = await uploadSpentProofFile(makeFile(), "user-1");
    expect(result).toEqual({
      ok: true,
      url: "/uploads/spent-adjustments/a.webp",
      private: false,
    });

    const [, , folder, options] = mocks.processAndSaveImage.mock.calls[0];
    expect(folder).toBe("spent-adjustments");
    expect(options).toEqual({ generateThumbnail: false, generateBlur: false });
  });

  it("生产环境未配置私有 bucket 时 fail-closed（503，不落公开存储）", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const result = await uploadSpentProofFile(makeFile(), "user-1");
      expect(result).toEqual({
        ok: false,
        status: 503,
        code: "STORAGE_NOT_CONFIGURED",
        message: "凭证存储未配置，请联系管理员（需配置 ALI_OSS_PRIVATE_BUCKET）",
      });
      expect(mocks.processAndSaveImage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("生产环境显式放行时可回退公开管线（逃生开关）", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PUBLIC_SPENT_PROOF_STORAGE", "true");
    try {
      mocks.processAndSaveImage.mockResolvedValue({ url: "/uploads/spent-adjustments/a.webp" });
      const result = await uploadSpentProofFile(makeFile(), "user-1");
      expect(result.ok).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
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

  it("含 .. 的 key 拒绝", async () => {
    const result = await resolveSpentProofImage("user-1", "spent-adjustments/user-1/../../x.webp");
    expect(result).toEqual({ ok: false, status: 400, code: "INVALID_PARAMS", message: "参数错误" });
  });

  it("新格式（当前用户前缀）直接放行，不查库，使用 15 分钟短时效签名", async () => {
    mocks.signPrivateObjectUrl.mockReturnValue("https://bucket/signed");
    const result = await resolveSpentProofImage("user-1", OWN_KEY);
    expect(result).toEqual({ ok: true, signedUrl: "https://bucket/signed" });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.signPrivateObjectUrl).toHaveBeenCalledWith(OWN_KEY, 15 * 60);
  });

  it("新格式但属于其他用户前缀时拒绝（不查库）", async () => {
    const result = await resolveSpentProofImage("user-1", OTHER_USER_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("历史格式（无 userId 前缀）不属于当前用户的申请返回 404", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const result = await resolveSpentProofImage("user-1", LEGACY_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });

  it("历史格式且签名失败返回 404 NOT_CONFIGURED", async () => {
    mocks.findFirst.mockResolvedValue({ id: "app-1" });
    mocks.signPrivateObjectUrl.mockReturnValue(null);
    const result = await resolveSpentProofImage("user-1", LEGACY_KEY);
    expect(result).toEqual({
      ok: false,
      status: 404,
      code: "NOT_CONFIGURED",
      message: "图片服务未配置",
    });
  });

  it("历史格式归属校验通过返回签名地址（仍查询申请归属）", async () => {
    mocks.findFirst.mockResolvedValue({ id: "app-1" });
    mocks.signPrivateObjectUrl.mockReturnValue("https://bucket.oss-cn.aliyuncs.com/x.webp?Signature=a");

    const result = await resolveSpentProofImage("user-1", LEGACY_KEY);
    expect(result).toEqual({
      ok: true,
      signedUrl: "https://bucket.oss-cn.aliyuncs.com/x.webp?Signature=a",
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", images: { has: LEGACY_KEY } },
      select: { id: true },
    });
  });

  it("任意非凭证命名空间的 key 拒绝", async () => {
    const result = await resolveSpentProofImage("user-1", "products/other.webp");
    expect(result.ok).toBe(false);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});

/**
 * 消费补录凭证文件助手单元测试（spent-adjustment-files）
 *
 * 覆盖：上传校验分支、私有 OSS / 本地私有存储选择、归属校验、
 * 本地文件读取/删除、任意 /uploads 路径拒绝。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  validateUploadServer: vi.fn(),
  validateFileBuffer: vi.fn(),
  processImageToWebp: vi.fn(),
  isPrivateBucketConfigured: vi.fn(),
  uploadToPrivateOSS: vi.fn(),
  signPrivateObjectUrl: vi.fn(),
  deletePrivateOSSObject: vi.fn(),
  findFirst: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  chmod: vi.fn(),
  access: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("@/lib/upload", () => ({
  validateUploadServer: mocks.validateUploadServer,
  validateFileBuffer: mocks.validateFileBuffer,
  processImageToWebp: mocks.processImageToWebp,
}));

vi.mock("@/lib/ali-oss", () => ({
  isPrivateBucketConfigured: mocks.isPrivateBucketConfigured,
  uploadToPrivateOSS: mocks.uploadToPrivateOSS,
  signPrivateObjectUrl: mocks.signPrivateObjectUrl,
  deletePrivateOSSObject: mocks.deletePrivateOSSObject,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { spentAdjustmentApplication: { findFirst: mocks.findFirst } },
}));

vi.mock("fs", () => ({
  promises: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    chmod: mocks.chmod,
    access: mocks.access,
    unlink: mocks.unlink,
  },
}));

import {
  uploadSpentProofFile,
  resolveSpentProofImage,
  deleteSpentProofFile,
  isSpentProofMultipartTooLarge,
} from "../spent-adjustment-files";

function makeFile(type = "image/jpeg", name = "receipt.jpg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const LOCAL_OWN = `private-local:spent-adjustments/user-1/${UUID}.webp`;
const LOCAL_OTHER = `private-local:spent-adjustments/user-2/${UUID}.webp`;
const OSS_OWN = `private-oss:spent-adjustments/user-1/${UUID}.webp`;
const OSS_LEGACY = `spent-adjustments/${UUID}.webp`;

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
    vi.unstubAllEnvs();
    mocks.validateUploadServer.mockReturnValue({ valid: true });
    mocks.validateFileBuffer.mockResolvedValue({ valid: true, detectedType: "image/jpeg" });
    mocks.isPrivateBucketConfigured.mockReturnValue(false);
    mocks.processImageToWebp.mockResolvedValue(Buffer.from("webp"));
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.chmod.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("私有 bucket 配置时上传到 OSS，返回 private-oss key", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    mocks.uploadToPrivateOSS.mockResolvedValue({
      objectName: `spent-adjustments/user-1/${UUID}.webp`,
    });

    const result = await uploadSpentProofFile(makeFile(), "user-1");
    expect(result).toEqual({
      ok: true,
      url: `private-oss:spent-adjustments/user-1/${UUID}.webp`,
      private: true,
    });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("未配置 OSS 时写入本地私有目录，返回 private-local key", async () => {
    vi.stubEnv("ALLOW_LOCAL_SPENT_PROOF_STORAGE", "true");
    const result = await uploadSpentProofFile(makeFile(), "user-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toMatch(/^private-local:spent-adjustments\/user-1\/[0-9a-f-]{36}\.webp$/i);
      expect(result.private).toBe(true);
    }
    expect(mocks.processImageToWebp).toHaveBeenCalled();
    expect(mocks.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("private"),
      expect.objectContaining({ recursive: true, mode: 0o700 })
    );
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("spent-adjustments"),
      expect.any(Buffer),
      expect.objectContaining({ mode: 0o600 })
    );
    expect(mocks.chmod).toHaveBeenCalledWith(expect.stringContaining("spent-adjustments"), 0o600);
  });

  it("生产环境未开本地私有且无 OSS 时 fail-closed（503）", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_SPENT_PROOF_STORAGE", "");
    const result = await uploadSpentProofFile(makeFile(), "user-1");

    expect(result).toEqual({
      ok: false,
      status: 503,
      code: "STORAGE_NOT_CONFIGURED",
      message: "凭证存储未配置，请联系管理员（需配置 ALLOW_LOCAL_SPENT_PROOF_STORAGE 或私有 OSS）",
    });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("生产环境显式 ALLOW_LOCAL_SPENT_PROOF_STORAGE=true 时允许本地私有", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_SPENT_PROOF_STORAGE", "true");
    const result = await uploadSpentProofFile(makeFile(), "user-1");
    expect(result.ok).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalled();
  });
});

describe("resolveSpentProofImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(undefined);
  });

  it("key 缺失、超长或含 .. 返回 400", async () => {
    for (const key of ["", "x".repeat(201), `${LOCAL_OWN}/../../etc/passwd`]) {
      const result = await resolveSpentProofImage("user-1", key);
      expect(result).toEqual({
        ok: false,
        status: 400,
        code: "INVALID_PARAMS",
        message: "参数错误",
      });
    }
  });

  it("本人本地 key 返回本地文件，不查库", async () => {
    const result = await resolveSpentProofImage("user-1", LOCAL_OWN);
    expect(result).toEqual({
      ok: true,
      kind: "file",
      path: expect.stringMatching(/spent-adjustments[\\/]user-1[\\/].*\.webp$/),
      contentType: "image/webp",
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("他人本地 key 返回 404，不查库", async () => {
    const result = await resolveSpentProofImage("user-1", LOCAL_OTHER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("本地文件不存在返回 404", async () => {
    mocks.access.mockRejectedValueOnce(new Error("ENOENT"));
    const result = await resolveSpentProofImage("user-1", LOCAL_OWN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });

  it("本人 OSS key 直接签名，不查库", async () => {
    mocks.signPrivateObjectUrl.mockReturnValue("https://bucket/signed");
    const result = await resolveSpentProofImage("user-1", OSS_OWN);
    expect(result).toEqual({ ok: true, kind: "redirect", signedUrl: "https://bucket/signed" });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.signPrivateObjectUrl).toHaveBeenCalledWith(
      `spent-adjustments/user-1/${UUID}.webp`,
      15 * 60
    );
  });

  it("历史 OSS key 必须命中当前用户申请", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const missing = await resolveSpentProofImage("user-1", OSS_LEGACY);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("NOT_FOUND");

    mocks.findFirst.mockResolvedValue({ id: "app-1" });
    mocks.signPrivateObjectUrl.mockReturnValue("https://bucket/signed");
    const ok = await resolveSpentProofImage("user-1", OSS_LEGACY);
    expect(ok).toEqual({ ok: true, kind: "redirect", signedUrl: "https://bucket/signed" });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", images: { has: OSS_LEGACY } },
      select: { id: true },
    });
  });

  it("任意非凭证命名空间的 key 拒绝", async () => {
    const result = await resolveSpentProofImage("user-1", "products/other.webp");
    expect(result.ok).toBe(false);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});

describe("deleteSpentProofFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unlink.mockResolvedValue(undefined);
    mocks.isPrivateBucketConfigured.mockReturnValue(false);
    mocks.deletePrivateOSSObject.mockResolvedValue(true);
  });

  it("删除本人本地 key", async () => {
    await expect(deleteSpentProofFile(LOCAL_OWN, "user-1")).resolves.toBe(true);
    expect(mocks.unlink).toHaveBeenCalledWith(expect.stringContaining("spent-adjustments"));
  });

  it("拒绝删除他人本地 key", async () => {
    await expect(deleteSpentProofFile(LOCAL_OTHER, "user-1")).resolves.toBe(false);
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("拒绝删除任意 /uploads 路径", async () => {
    await expect(deleteSpentProofFile("/uploads/images/NIHPLOD-logo.png", "user-1")).resolves.toBe(
      false
    );
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("本人 OSS key 在私有 bucket 配置时删除 OSS 对象", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    await expect(deleteSpentProofFile(OSS_OWN, "user-1")).resolves.toBe(true);
    expect(mocks.deletePrivateOSSObject).toHaveBeenCalledWith(
      `spent-adjustments/user-1/${UUID}.webp`
    );
  });
});

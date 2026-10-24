import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  validateFileBuffer: vi.fn(),
  isPrivateBucketConfigured: vi.fn(),
  uploadToPrivateOSS: vi.fn(),
  signPrivateObjectUrl: vi.fn(),
  deletePrivateOSSObject: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("@/lib/upload", () => ({ validateFileBuffer: mocks.validateFileBuffer }));
vi.mock("@/lib/ali-oss", () => ({
  isPrivateBucketConfigured: mocks.isPrivateBucketConfigured,
  uploadToPrivateOSS: mocks.uploadToPrivateOSS,
  signPrivateObjectUrl: mocks.signPrivateObjectUrl,
  deletePrivateOSSObject: mocks.deletePrivateOSSObject,
}));
vi.mock("fs", () => ({
  promises: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    access: mocks.access,
    unlink: mocks.unlink,
  },
}));

import {
  contentDispositionAttachment,
  deleteResumeFile,
  isPrivateResumeKey,
  resolveResumeDownload,
  sanitizeResumeFileName,
  uploadResumeFile,
} from "@/lib/resume-files";

const PDF = Buffer.from("%PDF-1.7\n");
const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("resume-files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.validateFileBuffer.mockResolvedValue({
      valid: true,
      detectedType: "application/pdf",
    });
    mocks.isPrivateBucketConfigured.mockReturnValue(false);
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.access.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("本地私有存储返回 private-local: key 并写入 private 目录", async () => {
    const result = await uploadResumeFile(PDF);

    expect(result.key).toMatch(/^private-local:resumes\/[0-9a-f-]{36}\.pdf$/i);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("private"),
      PDF,
      expect.objectContaining({ mode: 0o600 })
    );
  });

  it("配置私有 OSS 时上传到私有 bucket 并返回 private-oss: key", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    mocks.uploadToPrivateOSS.mockResolvedValue({ objectName: "resumes/x.pdf" });

    const result = await uploadResumeFile(PDF);

    expect(result.key).toBe("private-oss:resumes/x.pdf");
    expect(mocks.uploadToPrivateOSS).toHaveBeenCalledWith(
      PDF,
      expect.stringMatching(/^resumes\/.+\.pdf$/),
      "application/pdf"
    );
  });

  it("生产环境未配私有桶且未开逃生开关时 fail-closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_RESUME_STORAGE", "");

    await expect(uploadResumeFile(PDF)).rejects.toThrow("RESUME_STORAGE_NOT_CONFIGURED");
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("生产环境显式 ALLOW_LOCAL_RESUME_STORAGE=true 时允许本地", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_RESUME_STORAGE", "true");

    const result = await uploadResumeFile(PDF);
    expect(result.key).toMatch(/^private-local:/);
    expect(mocks.writeFile).toHaveBeenCalled();
  });

  it("非法文件类型拒绝上传", async () => {
    mocks.validateFileBuffer.mockResolvedValue({ valid: false, detectedType: "text/html" });
    await expect(uploadResumeFile(PDF)).rejects.toThrow("INVALID_RESUME_FILE");
  });

  it("仅接受私有简历 key", () => {
    expect(isPrivateResumeKey(`private-local:resumes/${UUID}.pdf`)).toBe(true);
    expect(isPrivateResumeKey(`private-oss:resumes/${UUID}.pdf`)).toBe(true);
    expect(isPrivateResumeKey(`private:resumes/${UUID}.pdf`)).toBe(true);
    expect(isPrivateResumeKey("/uploads/resumes/a.pdf")).toBe(false);
    expect(isPrivateResumeKey("private:resumes/../../etc/passwd")).toBe(false);
  });

  it("本地 key 在开启私有桶后仍然优先读本地，避免切换后端弄坏存量", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);

    const result = await resolveResumeDownload(`private-local:resumes/${UUID}.pdf`);

    expect(result).toEqual({
      kind: "file",
      path: expect.stringContaining(UUID),
      filename: "resume.pdf",
    });
    expect(mocks.signPrivateObjectUrl).not.toHaveBeenCalled();
  });

  it("历史 key 本地不存在时回退私有 OSS 签名地址", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    mocks.access.mockRejectedValueOnce(new Error("ENOENT"));
    mocks.signPrivateObjectUrl.mockReturnValue("https://signed.example");

    const result = await resolveResumeDownload(`private:resumes/${UUID}.pdf`, "张三.pdf");

    expect(result).toEqual({ kind: "redirect", url: "https://signed.example" });
    expect(mocks.signPrivateObjectUrl).toHaveBeenCalledWith(
      `resumes/${UUID}.pdf`,
      300,
      expect.stringContaining("filename*=UTF-8''")
    );
  });

  it("OSS key 直接签名，不再尝试本地路径", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    mocks.signPrivateObjectUrl.mockReturnValue("https://signed.example");

    const result = await resolveResumeDownload(`private-oss:resumes/${UUID}.pdf`);

    expect(result).toEqual({ kind: "redirect", url: "https://signed.example" });
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("删除 private-oss key 时 OSS 未配置会抛错，避免静默留下 PII", async () => {
    await expect(deleteResumeFile(`private-oss:resumes/${UUID}.pdf`)).rejects.toThrow(
      "PRIVATE_RESUME_BUCKET_NOT_CONFIGURED"
    );
  });

  it("删除历史 key 时本地与 OSS 都尝试", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    await deleteResumeFile(`private:resumes/${UUID}.pdf`);
    expect(mocks.unlink).toHaveBeenCalled();
    expect(mocks.deletePrivateOSSObject).toHaveBeenCalledWith(`resumes/${UUID}.pdf`);
  });

  it("清洗原始文件名并生成安全 Content-Disposition", () => {
    expect(sanitizeResumeFileName("../../张三的简历.pdf")).toBe("张三的简历.pdf");
    expect(sanitizeResumeFileName("resume")).toBe("resume.pdf");
    expect(contentDispositionAttachment("张三.pdf")).toContain(
      "filename*=UTF-8''%E5%BC%A0%E4%B8%89.pdf"
    );
  });
});

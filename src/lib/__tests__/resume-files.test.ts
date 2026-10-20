import { describe, it, expect, vi, beforeEach } from "vitest";

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
  deleteResumeFile,
  isPrivateResumeKey,
  resolveResumeDownload,
  uploadResumeFile,
} from "@/lib/resume-files";

const PDF = Buffer.from("%PDF-1.7\n");

describe("resume-files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("本地私有存储返回 private: key 并写入 private 目录", async () => {
    const result = await uploadResumeFile(PDF);

    expect(result.key).toMatch(/^private:resumes\/[0-9a-f-]{36}\.pdf$/i);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("private"),
      PDF,
      expect.objectContaining({ mode: 0o600 })
    );
  });

  it("配置私有 OSS 时上传到私有 bucket", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    mocks.uploadToPrivateOSS.mockResolvedValue({ objectName: "resumes/x.pdf" });

    const result = await uploadResumeFile(PDF);

    expect(result.key).toMatch(/^private:resumes\/.*\.pdf$/i);
    expect(mocks.uploadToPrivateOSS).toHaveBeenCalledWith(
      PDF,
      expect.stringMatching(/^resumes\/.+\.pdf$/),
      "application/pdf"
    );
  });

  it("非法文件类型拒绝上传", async () => {
    mocks.validateFileBuffer.mockResolvedValue({ valid: false, detectedType: "text/html" });
    await expect(uploadResumeFile(PDF)).rejects.toThrow("INVALID_RESUME_FILE");
  });

  it("仅接受私有简历 key", () => {
    expect(isPrivateResumeKey("private:resumes/123e4567-e89b-42d3-a456-426614174000.pdf")).toBe(
      true
    );
    expect(isPrivateResumeKey("/uploads/resumes/a.pdf")).toBe(false);
    expect(isPrivateResumeKey("private:resumes/../../etc/passwd")).toBe(false);
  });

  it("私有 OSS 下载返回短签名 URL", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    mocks.signPrivateObjectUrl.mockReturnValue("https://signed.example");

    const result = await resolveResumeDownload(
      "private:resumes/123e4567-e89b-42d3-a456-426614174000.pdf"
    );

    expect(result).toEqual({ kind: "redirect", url: "https://signed.example" });
    expect(mocks.signPrivateObjectUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^resumes\//),
      300
    );
  });

  it("删除私有 OSS 对象", async () => {
    mocks.isPrivateBucketConfigured.mockReturnValue(true);
    await deleteResumeFile("private:resumes/123e4567-e89b-42d3-a456-426614174000.pdf");
    expect(mocks.deletePrivateOSSObject).toHaveBeenCalledWith(
      "resumes/123e4567-e89b-42d3-a456-426614174000.pdf"
    );
  });
});

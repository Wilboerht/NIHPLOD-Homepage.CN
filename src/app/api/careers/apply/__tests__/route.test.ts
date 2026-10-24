import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const afterCallbacks: Array<() => unknown> = [];
  return {
    afterCallbacks,
    rateLimit: vi.fn(),
    getClientIP: vi.fn(),
    findJob: vi.fn(),
    createApplication: vi.fn(),
    uploadResumeFile: vi.fn(),
    deleteResumeFile: vi.fn(),
    sendWecomNotification: vi.fn(),
    formatJobApplicationToWecom: vi.fn(),
    fileTypeFromBuffer: vi.fn(),
    validateCSRFToken: vi.fn(),
  };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => unknown) => {
      mocks.afterCallbacks.push(callback);
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    job: { findFirst: mocks.findJob },
    jobApplication: { create: mocks.createApplication },
  },
}));
vi.mock("@/lib/resume-files", () => ({
  uploadResumeFile: mocks.uploadResumeFile,
  deleteResumeFile: mocks.deleteResumeFile,
  sanitizeResumeFileName: (name: string) => name,
}));
vi.mock("@/lib/wecom", () => ({
  sendWecomNotification: mocks.sendWecomNotification,
  formatJobApplicationToWecom: mocks.formatJobApplicationToWecom,
}));
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: mocks.rateLimit,
  getClientIP: mocks.getClientIP,
}));
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: mocks.validateCSRFToken,
  csrfForbiddenResponse: () => new Response("csrf", { status: 403 }),
}));
vi.mock("file-type", () => ({ fileTypeFromBuffer: mocks.fileTypeFromBuffer }));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";

function formRequest(fields: Record<string, string | File>, headers?: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return new NextRequest("http://localhost/api/careers/apply", {
    method: "POST",
    body: form,
    headers,
  });
}

function pdfFile(name = "张三简历.pdf", content = "%PDF-1.7\n") {
  return new File([content], name, { type: "application/pdf" });
}

describe("POST /api/careers/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.getClientIP.mockReturnValue("1.2.3.4");
    mocks.validateCSRFToken.mockReturnValue(true);
    mocks.fileTypeFromBuffer.mockResolvedValue({ mime: "application/pdf" });
    mocks.uploadResumeFile.mockResolvedValue({ key: "private-oss:resumes/x.pdf" });
    mocks.findJob.mockResolvedValue({ id: "job-1", title: "前端工程师" });
    mocks.createApplication.mockResolvedValue({ id: "app-1" });
    mocks.sendWecomNotification.mockResolvedValue({ success: true });
    mocks.formatJobApplicationToWecom.mockReturnValue("msg");
    mocks.deleteResumeFile.mockResolvedValue(undefined);
  });

  it("Content-Length 超过上限时在解析前返回 413", async () => {
    const request = new NextRequest("http://localhost/api/careers/apply", {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024) },
      body: new Uint8Array(0),
    });

    const response = await POST(request);
    expect(response.status).toBe(413);
  });

  it("resume 是普通字符串时返回 400 而不是 500", async () => {
    const response = await POST(
      formRequest({
        jobId: "job-1",
        name: "张三",
        phone: "13800138000",
        consent: "true",
        website: "",
        resume: "not-a-file",
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("MISSING_RESUME");
  });

  it("蜜罐命中时静默成功且不写库", async () => {
    const response = await POST(
      formRequest({
        jobId: "job-1",
        name: "张三",
        phone: "13800138000",
        consent: "true",
        website: "https://spam.example",
        resume: pdfFile(),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });

  it("合法投递会 trim 姓名、保存快照/同意时间，并在响应后异步通知", async () => {
    const file = pdfFile();
    const response = await POST(
      formRequest({
        jobId: "job-1",
        name: "  张三  ",
        phone: "13800138000",
        consent: "true",
        website: "",
        resume: file,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.createApplication).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        name: "张三",
        phone: "13800138000",
        resumePath: "private-oss:resumes/x.pdf",
        resumeFileName: "张三简历.pdf",
        resumeSize: file.size,
        jobTitleSnapshot: "前端工程师",
        consentAt: expect.any(Date),
      }),
    });
    expect(mocks.sendWecomNotification).not.toHaveBeenCalled();

    expect(mocks.afterCallbacks).toHaveLength(1);
    await mocks.afterCallbacks[0]();
    expect(mocks.sendWecomNotification).toHaveBeenCalledWith("msg", "job");
  });

  it("数据库写入失败时会等待清理已上传文件", async () => {
    mocks.createApplication.mockRejectedValue(new Error("db down"));

    const response = await POST(
      formRequest({
        jobId: "job-1",
        name: "张三",
        phone: "13800138000",
        consent: "true",
        website: "",
        resume: pdfFile(),
      })
    );

    expect(response.status).toBe(500);
    expect(mocks.deleteResumeFile).toHaveBeenCalledWith("private-oss:resumes/x.pdf");
  });
});

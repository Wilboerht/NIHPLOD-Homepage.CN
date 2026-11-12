import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    resumeDeletionTask: {
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/resume-files", () => ({
  isPrivateResumeKey: vi.fn(),
  deleteResumeFile: vi.fn(),
}));

vi.mock("@/lib/upload", () => ({
  deleteUploadedFile: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { deleteResumeFile, isPrivateResumeKey } from "@/lib/resume-files";
import { deleteUploadedFile } from "@/lib/upload";
import { processResumeDeletionTasks, RESUME_DELETION_MAX_ATTEMPTS } from "../resume-deletion";

describe("processResumeDeletionTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPrivateResumeKey).mockReturnValue(true);
    vi.mocked(deleteResumeFile).mockResolvedValue(undefined);
    vi.mocked(deleteUploadedFile).mockResolvedValue(true);
    (prisma.resumeDeletionTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "task-1", objectKey: "private-oss:resumes/a.pdf", attempts: 0 },
    ]);
  });

  it("删除成功后移除 outbox 任务", async () => {
    const count = await processResumeDeletionTasks();

    expect(count).toBe(1);
    expect(deleteResumeFile).toHaveBeenCalledWith("private-oss:resumes/a.pdf");
    expect(prisma.resumeDeletionTask.delete).toHaveBeenCalledWith({ where: { id: "task-1" } });
  });

  it("删除失败时按退避更新 attempts 与 nextAttemptAt", async () => {
    vi.mocked(deleteResumeFile).mockRejectedValue(new Error("oss down"));

    const count = await processResumeDeletionTasks();

    expect(count).toBe(0);
    expect(prisma.resumeDeletionTask.delete).not.toHaveBeenCalled();
    expect(prisma.resumeDeletionTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({ attempts: 1, lastError: "oss down" }),
      })
    );
  });

  it("达到最大次数后停止自动重试", async () => {
    (prisma.resumeDeletionTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "task-1",
        objectKey: "private-oss:resumes/a.pdf",
        attempts: RESUME_DELETION_MAX_ATTEMPTS - 1,
      },
    ]);
    vi.mocked(deleteResumeFile).mockRejectedValue(new Error("oss down"));

    await processResumeDeletionTasks();

    const call = (prisma.resumeDeletionTask.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.attempts).toBe(RESUME_DELETION_MAX_ATTEMPTS);
    expect(new Date(call.data.nextAttemptAt).getTime()).toBeGreaterThan(
      Date.now() + 300 * 24 * 3600
    );
  });

  it("旧公开简历走 deleteUploadedFile", async () => {
    vi.mocked(isPrivateResumeKey).mockReturnValue(false);
    (prisma.resumeDeletionTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "task-2", objectKey: "/uploads/resumes/a.pdf", attempts: 0 },
    ]);

    await processResumeDeletionTasks();

    expect(deleteUploadedFile).toHaveBeenCalledWith("/uploads/resumes/a.pdf");
  });
});

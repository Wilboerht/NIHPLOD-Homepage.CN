/**
 * 定时任务监控路由测试
 * GET/POST /api/admin/cron-tasks
 *
 * 覆盖：
 * - 非 owner 403（读与触发）
 * - GET：任务清单 + 最近一次运行状态映射
 * - POST：未知任务 404；成功触发写审计 run_cron_task；失败返回 500 且同样留痕
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    cronTaskRun: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    NextResponse.json({ success: false, error: { code: "CSRF_INVALID" } }, { status: 403 }),
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

vi.mock("@/lib/cron-tasks", () => ({
  isLocalCronEnabled: vi.fn().mockReturnValue(true),
  listCronTasks: vi.fn().mockReturnValue([
    {
      key: "expire-points",
      name: "Expire Points",
      cronExpression: "30 4 * * *",
      isCleanup: false,
      timeoutMs: 600000,
    },
    {
      key: "grant-birthday-points",
      name: "Grant Birthday Points",
      cronExpression: "0 8 * * *",
      isCleanup: false,
      timeoutMs: 600000,
    },
  ]),
  runCronTask: vi.fn(),
}));

import { GET, POST } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { runCronTask } from "@/lib/cron-tasks";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const ADMIN = { ...OWNER, role: "admin" };

function createRequest(method: "GET" | "POST", body?: unknown) {
  return new NextRequest("http://localhost/api/admin/cron-tasks", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("GET /api/admin/cron-tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.cronTaskRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("非 owner 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(403);
  });

  it("返回任务清单与最近一次运行状态", async () => {
    const run = {
      id: "run-1",
      taskKey: "expire-points",
      taskName: "Expire Points",
      trigger: "cron",
      status: "FAILED",
      success: false,
      error: "db down",
      adminId: null,
      adminEmail: null,
      adminName: null,
      startedAt: new Date("2026-09-17T04:30:00Z"),
      heartbeatAt: null,
      finishedAt: new Date("2026-09-17T04:30:01Z"),
      timeoutMs: 600000,
      sourceRunId: null,
      batchId: null,
    };
    (prisma.cronTaskRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([run]);
    (prisma.cronTaskRun.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { taskName: string } }) =>
        where.taskName === "Expire Points" ? run : null
    );

    const res = await GET(createRequest("GET"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.tasks).toHaveLength(2);
    const expire = data.data.tasks.find((t: { name: string }) => t.name === "Expire Points");
    expect(expire.lastRun.success).toBe(false);
    expect(expire.lastRun.error).toBe("db down");
  });
});

describe("POST /api/admin/cron-tasks（手动触发）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
  });

  it("非 owner 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    const res = await POST(createRequest("POST", { taskName: "Expire Points" }));
    expect(res.status).toBe(403);
    expect(runCronTask).not.toHaveBeenCalled();
  });

  it("未知任务返回 404", async () => {
    const res = await POST(createRequest("POST", { taskName: "Not Exist" }));
    expect(res.status).toBe(404);
    expect(runCronTask).not.toHaveBeenCalled();
  });

  it("触发成功：以 manual 模式执行并写审计", async () => {
    vi.mocked(runCronTask).mockResolvedValue({
      ok: true,
      status: "SUCCESS",
      runId: "run-1",
      durationMs: 10,
    });

    const res = await POST(createRequest("POST", { taskName: "Expire Points" }));

    expect(res.status).toBe(200);
    expect(runCronTask).toHaveBeenCalledWith(
      "expire-points",
      "manual",
      "admin-1",
      expect.objectContaining({ adminEmail: "owner@test.com", adminName: "Owner" })
    );
    expect(beginAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "run_cron_task",
        targetType: "system",
        targetId: "expire-points",
      })
    );
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({ success: true, runId: "run-1", status: "SUCCESS" })
    );
  });

  it("任务失败返回 500 并留痕失败原因", async () => {
    vi.mocked(runCronTask).mockResolvedValue({
      ok: false,
      status: "FAILED",
      error: "boom",
    });

    const res = await POST(createRequest("POST", { taskName: "Expire Points" }));

    expect(res.status).toBe(500);
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "FAILURE",
      expect.objectContaining({ success: false, error: "boom", status: "FAILED" })
    );
  });
});

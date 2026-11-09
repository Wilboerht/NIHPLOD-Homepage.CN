/**
 * 定时任务监控 API（管理端）
 * GET  /api/admin/cron-tasks - 任务清单 + 最近运行状态
 * POST /api/admin/cron-tasks - 手动触发指定任务（审计 run_cron_task）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { isLocalCronEnabled, listCronTasks, runCronTask } from "@/lib/cron-tasks";

export const dynamic = "force-dynamic";

const runStatusSchema = z.enum(["RUNNING", "SUCCESS", "FAILED", "TIMEOUT", "SKIPPED"]);

const querySchema = z.object({
  runStatus: runStatusSchema.optional(),
  runLimit: z.coerce.number().int().min(1).max(100).default(30),
});

const triggerSchema = z
  .object({
    taskName: z.string().min(1).max(120).optional(),
    taskKey: z.string().min(1).max(120).optional(),
    sourceRunId: z.string().min(1).max(100).optional(),
  })
  .refine((data) => Boolean(data.taskName || data.taskKey), {
    message: "taskName 或 taskKey 必填",
  });

type CronRunRow = {
  id: string;
  taskKey: string | null;
  taskName: string;
  trigger: string;
  status: string | null;
  success: boolean | null;
  error: string | null;
  adminId: string | null;
  adminEmail: string | null;
  adminName: string | null;
  startedAt: Date;
  heartbeatAt: Date | null;
  finishedAt: Date | null;
  timeoutMs: number | null;
  sourceRunId: string | null;
  batchId: string | null;
};

function effectiveStatus(run: Pick<CronRunRow, "status" | "success">): string {
  if (run.status) return run.status;
  return run.success ? "SUCCESS" : "FAILED";
}

function serializeRun(run: CronRunRow) {
  const status = effectiveStatus(run);
  const finishedAt = run.finishedAt;
  return {
    id: run.id,
    taskKey: run.taskKey,
    taskName: run.taskName,
    trigger: run.trigger,
    status,
    success: run.success,
    error: run.error,
    adminId: run.adminId,
    adminEmail: run.adminEmail,
    adminName: run.adminName,
    startedAt: run.startedAt.toISOString(),
    heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    finishedAt: finishedAt?.toISOString() ?? null,
    durationMs: finishedAt ? finishedAt.getTime() - run.startedAt.getTime() : null,
    timeoutMs: run.timeoutMs,
    sourceRunId: run.sourceRunId,
    batchId: run.batchId,
  };
}

function cronMode(): "local" | "external" | "disabled" {
  if (isLocalCronEnabled()) return "local";
  if (process.env.CRON_SECRET) return "external";
  return "disabled";
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "cron:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：定时任务查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "cron-tasks:read", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      runStatus: searchParams.get("runStatus") || undefined,
      runLimit: searchParams.get("runLimit") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const tasks = listCronTasks();
    const recentRuns = (await prisma.cronTaskRun.findMany({
      where: parsed.data.runStatus ? { status: parsed.data.runStatus } : undefined,
      orderBy: { startedAt: "desc" },
      take: 300,
    })) as CronRunRow[];

    const lastRuns = await Promise.all(
      tasks.map((task) =>
        prisma.cronTaskRun.findFirst({
          where: { taskName: task.name },
          orderBy: { startedAt: "desc" },
        })
      )
    );
    const lastRunMap = new Map(
      lastRuns
        .filter((run): run is NonNullable<typeof run> => run !== null)
        .map((run) => [run.taskName, run as CronRunRow])
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          cronEnabled: isLocalCronEnabled(),
          cronMode: cronMode(),
          cronSecretConfigured: Boolean(process.env.CRON_SECRET),
          tasks: tasks.map((task) => {
            const last = lastRunMap.get(task.name);
            return {
              key: task.key,
              name: task.name,
              cronExpression: task.cronExpression,
              isCleanup: task.isCleanup,
              timeoutMs: task.timeoutMs,
              lastRun: last ? serializeRun(last) : null,
            };
          }),
          recentRuns: recentRuns.slice(0, parsed.data.runLimit).map(serializeRun),
        },
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    apiConsole.error("[AdminCronTasks] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "cron:run")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：定时任务执行" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "cron-tasks:trigger", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

    const body = await request.json();
    const parsed = triggerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const tasks = listCronTasks();
    const task = parsed.data.taskKey
      ? tasks.find((item) => item.key === parsed.data.taskKey)
      : tasks.find((item) => item.name === parsed.data.taskName);
    if (!task) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "任务不存在" } },
        { status: 404 }
      );
    }

    if (parsed.data.sourceRunId) {
      const sourceRun = await prisma.cronTaskRun.findUnique({
        where: { id: parsed.data.sourceRunId },
        select: { taskName: true, status: true },
      });
      if (!sourceRun || sourceRun.taskName !== task.name) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_PARAMS", message: "来源运行记录不匹配" } },
          { status: 400 }
        );
      }
      if (sourceRun.status === "RUNNING") {
        return NextResponse.json(
          { success: false, error: { code: "ALREADY_RUNNING", message: "来源任务仍在运行" } },
          { status: 409 }
        );
      }
    }

    const auditId = await beginAuditLog({
      action: "run_cron_task",
      targetType: "system",
      targetId: task.key,
      detail: {
        taskName: task.name,
        taskKey: task.key,
        sourceRunId: parsed.data.sourceRunId ?? null,
        status: null,
        runId: null,
        error: null,
      },
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
        },
        { status: 503 }
      );
    }

    const result = await runCronTask(task.key, "manual", admin.id, {
      sourceRunId: parsed.data.sourceRunId,
      adminEmail: admin.email,
      adminName: admin.name,
    }).catch(async (error) => {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      await finishAuditLog(auditId, "FAILURE", {
        taskName: task.name,
        taskKey: task.key,
        status: "FAILED",
        error: message,
      });
      throw error;
    });

    await finishAuditLog(auditId, result.ok ? "SUCCESS" : "FAILURE", {
      taskName: task.name,
      taskKey: task.key,
      runId: result.runId ?? null,
      sourceRunId: parsed.data.sourceRunId ?? null,
      status: result.status,
      success: result.ok,
      durationMs: result.durationMs ?? null,
      error: result.error ?? null,
    });

    if (result.status === "SKIPPED") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "ALREADY_RUNNING", message: result.error ?? "任务正在执行中" },
          data: { runId: result.runId ?? null, status: result.status },
        },
        { status: 409 }
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.status === "TIMEOUT" ? "TASK_TIMEOUT" : "TASK_FAILED",
            message: `任务执行失败：${result.error ?? "未知错误"}`,
          },
          data: { runId: result.runId ?? null, status: result.status },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "任务执行完成",
        runId: result.runId ?? null,
        status: result.status,
        durationMs: result.durationMs ?? null,
      },
    });
  } catch (error) {
    apiConsole.error("[AdminCronTasks] 触发失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

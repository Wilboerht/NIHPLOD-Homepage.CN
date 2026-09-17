/**
 * 定时任务监控 API（管理端，仅超级管理员）
 * GET  /api/admin/cron-tasks - 任务清单 + 最近运行状态
 * POST /api/admin/cron-tasks - 手动触发指定任务（审计 run_cron_task）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { isLocalCronEnabled, listCronTasks, runCronTask } from "@/lib/cron-tasks";

export const dynamic = "force-dynamic";

const triggerSchema = z.object({
  taskName: z.string().min(1).max(120),
});

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

    const rateLimitResponse = await checkAdminRateLimit(request, "cron-tasks:read");
    if (rateLimitResponse) return rateLimitResponse;

    const tasks = listCronTasks();
    const recentRuns = await prisma.cronTaskRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 300,
    });

    // 每个任务取最近一次运行
    const lastRunMap = new Map<string, (typeof recentRuns)[number]>();
    for (const run of recentRuns) {
      if (!lastRunMap.has(run.taskName)) lastRunMap.set(run.taskName, run);
    }

    return NextResponse.json({
      success: true,
      data: {
        cronEnabled: isLocalCronEnabled(),
        tasks: tasks.map((t) => {
          const last = lastRunMap.get(t.name);
          return {
            name: t.name,
            cronExpression: t.cronExpression,
            lastRun: last
              ? {
                  startedAt: last.startedAt.toISOString(),
                  finishedAt: last.finishedAt.toISOString(),
                  success: last.success,
                  trigger: last.trigger,
                  error: last.error,
                }
              : null,
          };
        }),
        recentRuns: recentRuns.slice(0, 30).map((r) => ({
          id: r.id,
          taskName: r.taskName,
          trigger: r.trigger,
          success: r.success,
          error: r.error,
          startedAt: r.startedAt.toISOString(),
          finishedAt: r.finishedAt.toISOString(),
        })),
      },
    });
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

    const rateLimitResponse = await checkAdminRateLimit(request, "cron-tasks:trigger");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = triggerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { taskName } = parsed.data;
    if (!listCronTasks().some((t) => t.name === taskName)) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "任务不存在" } },
        { status: 404 }
      );
    }

    const result = await runCronTask(taskName, "manual", admin.id);

    await createAuditLog({
      action: "run_cron_task",
      targetType: "system",
      targetId: taskName,
      detail: { taskName, success: result.ok, error: result.error ?? null },
      adminId: admin.id,
      request,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TASK_FAILED", message: `任务执行失败：${result.error ?? "未知错误"}` },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { message: "任务执行完成" } });
  } catch (error) {
    apiConsole.error("[AdminCronTasks] 触发失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

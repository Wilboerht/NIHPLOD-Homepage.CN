/**
 * 外部调度器触发端点
 * POST /api/cron/run
 * Authorization: Bearer <CRON_SECRET>
 *
 * 供多实例部署或 ENABLE_LOCAL_CRON=false 时，由外部调度器
 * （K8s CronJob、系统 crond、云函数定时触发器等）周期性调用，
 * 触发全部清理类定时任务（运行记录与进程内 cron 一样落库 CronTaskRun）。
 *
 * Body（可选 JSON）：{ "taskName": "<任务名>" } 仅触发指定任务，
 * 与 /api/admin/cron-tasks 的手动触发等价；不传 body 时依次触发全部清理类任务。
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runCleanupCronTasks, runCronTask } from "@/lib/cron-tasks";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: { code: "CRON_SECRET_NOT_CONFIGURED", message: "CRON_SECRET 未配置" } },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const presented = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!presented) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }
  const bufA = Buffer.from(presented);
  const bufB = Buffer.from(cronSecret);
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }

  // 可选 body：{ taskName } 仅触发指定任务
  let taskName: string | undefined;
  const bodyText = await request.text();
  if (bodyText) {
    try {
      const body = JSON.parse(bodyText) as { taskName?: unknown };
      if (typeof body.taskName === "string" && body.taskName.length > 0) {
        taskName = body.taskName;
      }
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_JSON", message: "请求体不是合法 JSON" } },
        { status: 400 }
      );
    }
  }

  if (taskName) {
    const result = await runCronTask(taskName, "external");
    if (!result.ok && result.error === "任务不存在") {
      return NextResponse.json(
        { success: false, error: { code: "TASK_NOT_FOUND", message: "任务不存在" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: result.ok, data: { taskName, ...result } },
      { status: result.ok ? 200 : 500 }
    );
  }

  apiConsole.info("[CronRun] 外部调度器触发全部清理类任务");
  const results = await runCleanupCronTasks();
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json(
    { success: failed.length === 0, data: { results } },
    { status: failed.length === 0 ? 200 : 500 }
  );
}

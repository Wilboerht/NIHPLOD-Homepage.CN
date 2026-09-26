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
 *
 * 并发保护：事务级 PostgreSQL advisory lock（跨实例互斥），同一时刻只允许一个
 * 调度在运行；拿不到锁立即返回 409，避免多实例/重复调度并发执行大批 deleteMany。
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runCleanupCronTasks, runCronTask } from "@/lib/cron-tasks";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** advisory lock key（任意稳定 64 位整数即可；此处取 "NPCRON" 的十六进制值） */
const CRON_ADVISORY_LOCK_KEY = BigInt("0x4e5043524f4e");

/** 整次调度的事务超时（毫秒）：超时事务回滚并自动释放 advisory lock */
const CRON_RUN_TIMEOUT_MS = 280_000;

type LockResult<T> = { locked: false } | { locked: true; value: T };

/**
 * 在事务级 advisory lock 保护下执行调度任务：
 * - 锁随事务结束自动释放（无需手动 unlock，且不受连接池影响）
 * - 拿不到锁返回 { locked: false }（其他实例正在执行）
 * - 任务超时/异常时事务回滚，锁释放，异常上抛由调用方转 5xx
 */
async function runWithCronLock<T>(task: () => Promise<T>): Promise<LockResult<T>> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${CRON_ADVISORY_LOCK_KEY}) AS locked
      `;
      if (!rows[0]?.locked) {
        return { locked: false as const };
      }
      const value = await task();
      return { locked: true as const, value };
    },
    { timeout: CRON_RUN_TIMEOUT_MS, maxWait: 10_000 }
  );
}

function alreadyRunningResponse() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "ALREADY_RUNNING", message: "已有调度任务正在执行，请稍后重试" },
    },
    { status: 409 }
  );
}

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

  try {
    if (taskName) {
      const lockedResult = await runWithCronLock(() => runCronTask(taskName!, "external"));
      if (!lockedResult.locked) return alreadyRunningResponse();
      const result = lockedResult.value;
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
    const lockedResult = await runWithCronLock(() => runCleanupCronTasks());
    if (!lockedResult.locked) return alreadyRunningResponse();
    const results = lockedResult.value;
    const failed = results.filter((r) => !r.ok);
    return NextResponse.json(
      { success: failed.length === 0, data: { results } },
      { status: failed.length === 0 ? 200 : 500 }
    );
  } catch (error) {
    apiConsole.error("[CronRun] 调度执行异常（可能超时）:", error);
    return NextResponse.json(
      { success: false, error: { code: "CRON_RUN_FAILED", message: "调度执行异常，请查看服务端日志" } },
      { status: 500 }
    );
  }
}

/**
 * 定时任务管理 API
 * 仅限管理员使用
 * 
 * GET /api/admin/cron - 查看所有定时任务状态
 * POST /api/admin/cron/run - 手动执行某个定时任务
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getCronTasksStatus, runCronTaskManually } from "@/lib/cron-tasks";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";

// 只允许管理员访问（owner 和 admin）
async function validateAdmin(request: NextRequest) {
  const payload = await verifyAuth(request);
  if (!payload || !["admin", "owner"].includes(payload.role)) {
    return null;
  }
  return payload;
}

export const dynamic = "force-dynamic";

/**
 * GET - 查看所有定时任务状态
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await validateAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "仅管理员可访问" } },
        { status: 401 }
      );
    }

    // 速率限制
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default");
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
        { status: 429 }
      );
    }

    const taskStatus = getCronTasksStatus();

    return NextResponse.json({
      success: true,
      data: {
        tasks: taskStatus,
        count: taskStatus.length,
        message: `共有 ${taskStatus.length} 个定时任务`,
      },
    });
  } catch (error) {
    console.error("[Cron Admin API] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500 }
    );
  }
}

/**
 * POST - 手动执行某个定时任务
 */
export async function POST(request: NextRequest) {
  try {
    // 速率限制：管理员手动触发任务，每分钟最多 10 次
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 10, windowMs: 60 * 1000 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
        { status: 429 }
      );
    }

    const admin = await validateAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "仅管理员可访问" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const schema = z.object({
      taskName: z.string().min(1, "任务名称不能为空"),
    });

    const result = schema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { taskName } = result.data;
    const execResult = await runCronTaskManually(taskName);

    // 记录审计日志
    await createAuditLog({
      action: "run_cron_task",
      targetType: "system",
      targetId: taskName,
      detail: { success: execResult.success, message: execResult.message },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: execResult.success,
      data: {
        taskName,
        message: execResult.message,
      },
    });
  } catch (error) {
    console.error("[Cron Admin API] 执行失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "执行失败" } },
      { status: 500 }
    );
  }
}

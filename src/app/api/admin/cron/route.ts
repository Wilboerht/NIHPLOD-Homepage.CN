/**
 * 定时任务管理 API
 * 仅限管理员使用
 * 
 * GET /api/admin/cron - 查看所有定时任务状态
 * POST /api/admin/cron/run - 手动执行某个定时任务
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { getCronTasksStatus, runCronTaskManually } from "@/lib/cron-tasks";
import { z } from "zod";

// 只允许管理员访问
async function validateAdmin(request: NextRequest) {
  const payload = await verifyUserAuth(request);
  if (!payload || payload.role !== "admin") {
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

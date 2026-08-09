import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { apiConsole } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// 批量操作 Schema
const BatchSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(100, "一次最多操作 100 个职位"),
  action: z.enum(["publish", "unpublish", "delete"]),
});

// POST /api/admin/jobs/batch - 批量操作
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!validateCSRFToken(request)) return csrfForbiddenResponse();

    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { ids, action } = BatchSchema.parse(body);

    if (action === "delete" && admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可批量删除职位" } },
        { status: 403 }
      );
    }

    let count = 0;

    if (action === "publish") {
      const result = await prisma.job.updateMany({
        where: { id: { in: ids } },
        data: { published: true },
      });
      count = result.count;
    } else if (action === "unpublish") {
      const result = await prisma.job.updateMany({
        where: { id: { in: ids } },
        data: { published: false },
      });
      count = result.count;
    } else if (action === "delete") {
      const referencedApps = await prisma.jobApplication.findMany({
        where: { jobId: { in: ids } },
        select: { jobId: true },
        distinct: ["jobId"],
      });
      if (referencedApps.length > 0) {
        const referencedIds = referencedApps.map((a) => a.jobId);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "REFERENCED_JOBS",
              message: "部分职位存在申请记录，无法删除",
              referencedIds,
            },
          },
          { status: 409 }
        );
      }
      const result = await prisma.job.deleteMany({
        where: { id: { in: ids } },
      });
      count = result.count;
    }

    // 清除前端缓存
    if (count > 0) {
      revalidatePath("/careers");
    }

    const actionText = {
      publish: "发布",
      unpublish: "取消发布",
      delete: "删除",
    }[action];

    createAuditLog({
      action: "batch_job",
      targetType: "job",
      targetId: "batch",
      detail: { ids, action, count },
      adminId: admin.id,
      request,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        message: `已${actionText} ${count} 个职位`,
        count,
      },
    });
  } catch (error) {
    apiConsole.error("批量操作失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "批量操作失败" } },
      { status: 500 }
    );
  }
}

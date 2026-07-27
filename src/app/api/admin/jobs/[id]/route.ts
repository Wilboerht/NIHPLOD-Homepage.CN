import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sanitizeHtml } from "@/lib/html-sanitize";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// 职位类型
const JOB_TYPES = ["fulltime", "parttime", "intern"] as const;

// 更新职位 Schema
const UpdateJobSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  titleEn: z.string().max(100).optional().nullable(),
  location: z.string().min(1).max(100).optional(),
  type: z.enum(JOB_TYPES).optional(),
  description: z.string().min(1).optional(),
  requirements: z.string().min(1).optional(),
  salary: z.string().max(50).optional().nullable(),
  longitude: z.number().optional().nullable(),
  latitude: z.number().optional().nullable(),
  published: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

// GET /api/admin/jobs/[id] - 获取职位详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "职位不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    apiConsole.error("获取职位详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "获取职位详情失败" } },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/jobs/[id] - 更新职位
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();
    const validated = UpdateJobSchema.parse(body);

    // 对 HTML 字段入库前消毒
    const sanitized: typeof validated = {
      ...validated,
      description: sanitizeHtml(validated.description),
      requirements: sanitizeHtml(validated.requirements),
    };

    // 检查是否存在
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "职位不存在" } },
        { status: 404 }
      );
    }

    // 更新职位
    const job = await prisma.job.update({
      where: { id },
      data: {
        ...(sanitized.title !== undefined && { title: sanitized.title }),
        ...(sanitized.titleEn !== undefined && { titleEn: sanitized.titleEn }),
        ...(sanitized.location !== undefined && { location: sanitized.location }),
        ...(sanitized.type !== undefined && { type: sanitized.type }),
        ...(sanitized.description !== undefined && { description: sanitized.description }),
        ...(sanitized.requirements !== undefined && { requirements: sanitized.requirements }),
        ...(sanitized.salary !== undefined && { salary: sanitized.salary }),
        ...(sanitized.longitude !== undefined && { longitude: sanitized.longitude }),
        ...(sanitized.latitude !== undefined && { latitude: sanitized.latitude }),
        ...(sanitized.published !== undefined && { published: sanitized.published }),
        ...(sanitized.order !== undefined && { order: sanitized.order }),
      },
    });

    // 清除前端缓存
    revalidatePath("/careers");

    // 记录审计日志
    createAuditLog({
      action: "update_job",
      targetType: "job",
      targetId: job.id,
      detail: sanitized,
      adminId: admin.id,
      request,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    apiConsole.error("更新职位失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新职位失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/jobs/[id] - 删除职位
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    // 检查是否存在
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "职位不存在" } },
        { status: 404 }
      );
    }

    // 删除职位
    await prisma.job.delete({ where: { id } });

    // 清除前端缓存
    revalidatePath("/careers");

    // 记录审计日志
    createAuditLog({
      action: "delete_job",
      targetType: "job",
      targetId: id,
      detail: { title: existing.title },
      adminId: admin.id,
      request,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: { message: "职位已删除" },
    });
  } catch (error) {
    apiConsole.error("删除职位失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "删除职位失败" } },
      { status: 500 }
    );
  }
}

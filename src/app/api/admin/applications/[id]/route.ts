import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import prisma from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/upload";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { createAuditLog, type AuditAction } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  status: z.enum(["pending", "reviewed", "interviewed", "rejected", "hired"]).optional(),
  notes: z.string().max(5000, "备注最多5000字符").optional(),
  folderId: z.string().min(1).optional().nullable(),
});

// GET /api/admin/applications/[id] - 获取单个申请详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "applications:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：简历查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            titleEn: true,
            location: true,
            type: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    apiConsole.error("获取申请详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/applications/[id] - 更新申请状态
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "applications:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：简历编辑" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    if (!validateCSRFToken(request)) return csrfForbiddenResponse();

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }
    const { status, notes, folderId } = parsed.data;

    // 验证分类夹是否存在
    if (folderId && folderId !== null) {
      const folder = await prisma.applicationFolder.findUnique({ where: { id: folderId } });
      if (!folder) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_FOLDER", message: "分类夹不存在" } },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (folderId !== undefined) updateData.folderId = folderId; // null 表示移除分类

    const application = await prisma.jobApplication.update({
      where: { id },
      data: updateData,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            titleEn: true,
          },
        },
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    createApplicationAuditLog(
      "update_application",
      id,
      { status, notes, folderId },
      admin,
      request
    ).catch(() => {});

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    // 记录不存在（含并发删除）映射为 404，而非 500
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
        { status: 404 }
      );
    }
    apiConsole.error("更新申请失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新失败" } },
      { status: 500 }
    );
  }
}

async function createApplicationAuditLog(
  action: AuditAction,
  targetId: string,
  detail: Record<string, unknown>,
  admin: { id: string },
  request: NextRequest
) {
  try {
    await createAuditLog({
      action,
      targetType: "application",
      targetId,
      detail,
      adminId: admin.id,
      request,
    });
  } catch {
    // 审计日志失败不阻断业务
  }
}

// DELETE /api/admin/applications/[id] - 删除申请
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "applications:delete")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：简历删除" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const rateLimitResponse2 = await checkAdminRateLimit(request);
    if (rateLimitResponse2) return rateLimitResponse2;

    if (!validateCSRFToken(request)) return csrfForbiddenResponse();

    // 先获取申请记录以删除关联的简历文件
    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: { resumePath: true },
    });

    if (!application) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
        { status: 404 }
      );
    }

    await prisma.jobApplication.delete({ where: { id } });

    if (application?.resumePath) {
      await deleteUploadedFile(application.resumePath);
    }

    createApplicationAuditLog("delete_application", id, {}, admin, request).catch(() => {});

    return NextResponse.json({ success: true, message: "删除成功" });
  } catch (error) {
    // 并发删除竞争：delete 抛 P2025 时返回 404
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
        { status: 404 }
      );
    }
    apiConsole.error("删除申请失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "删除失败" } },
      { status: 500 }
    );
  }
}

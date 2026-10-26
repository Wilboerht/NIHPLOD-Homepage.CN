import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import prisma from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/upload";
import { deleteResumeFile, isPrivateResumeKey } from "@/lib/resume-files";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { beginAuditLog, createAuditLogStrict, finishAuditLog } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { requireAdminStepUp } from "@/lib/admin-totp";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

const statusSchema = z.enum(["pending", "reviewed", "interviewed", "rejected", "hired"]);

const patchSchema = z
  .object({
    status: statusSchema.optional(),
    notes: z.string().max(5000, "备注最多5000字符").optional(),
    folderId: z.string().min(1).optional().nullable(),
    /** 乐观锁：只有当前状态匹配时才更新，防止并发覆盖 */
    expectedStatus: statusSchema.optional(),
    /** 乐观锁：备注/其他字段保存前的 updatedAt */
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .refine((data) => !data.expectedStatus || data.status, {
    message: "expectedStatus 必须与 status 一起使用",
    path: ["expectedStatus"],
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

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: {
        id: true,
        jobId: true,
        name: true,
        phone: true,
        resumePath: true,
        resumeFileName: true,
        resumeSize: true,
        jobTitleSnapshot: true,
        consentAt: true,
        status: true,
        notes: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
        job: {
          select: {
            id: true,
            title: true,
            titleEn: true,
            location: true,
            type: true,
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

    if (!application) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const { resumePath, ...safeApplication } = application;
    const hasResume = Boolean(resumePath);

    // 简历详情含姓名/手机号/简历文件，查看即写审计（PII 访问留痕，失败则拒绝返回）
    await createAuditLogStrict({
      action: "application_detail_view",
      targetType: "application",
      targetId: id,
      detail: { jobId: application.jobId, hasResume },
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      adminId: admin.id,
      request,
    });

    return NextResponse.json(
      { success: true, data: { ...safeApplication, hasResume } },
      { headers: NO_STORE_HEADERS }
    );
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

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-write", admin.id);
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
    const { status, notes, folderId, expectedStatus, expectedUpdatedAt } = parsed.data;

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

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_CHANGES", message: "没有可更新的字段" } },
        { status: 400 }
      );
    }

    // 候选人备注属于 HR 敏感文本，不写入通用审计明细；
    // 只记录是否变更及长度，满足追溯需要又避免审计日志越权留存原文。
    const auditDetail = {
      status,
      folderId,
      ...(expectedStatus ? { expectedStatus } : {}),
      notesChanged: notes !== undefined,
      notesLength: notes?.length ?? null,
    };
    const auditId = await beginAuditLog({
      action: "update_application",
      targetType: "application",
      targetId: id,
      detail: auditDetail,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
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

    let updateCount = 0;
    try {
      const result = await prisma.jobApplication.updateMany({
        where: {
          id,
          ...(expectedStatus ? { status: expectedStatus } : {}),
          ...(expectedUpdatedAt ? { updatedAt: new Date(expectedUpdatedAt) } : {}),
        },
        data: updateData,
      });
      updateCount = result.count;
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", auditDetail);
      throw error;
    }

    if (updateCount === 0) {
      const current = await prisma.jobApplication.findUnique({
        where: { id },
        select: { status: true, updatedAt: true },
      });
      await finishAuditLog(auditId, "FAILURE", auditDetail);
      if (!current) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
          { status: 404 }
        );
      }
      const statusConflict = expectedStatus && current.status !== expectedStatus;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: statusConflict ? "STATUS_CONFLICT" : "STALE_APPLICATION",
            message: statusConflict
              ? "该申请状态已被其他管理员更新，请刷新后重试"
              : "该申请已被其他管理员修改，请刷新后重试",
            details: {
              currentStatus: current.status,
              currentUpdatedAt: current.updatedAt.toISOString(),
            },
          },
        },
        { status: 409 }
      );
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: {
        id: true,
        jobId: true,
        name: true,
        phone: true,
        resumeFileName: true,
        resumeSize: true,
        jobTitleSnapshot: true,
        status: true,
        notes: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
        job: {
          select: {
            id: true,
            title: true,
            titleEn: true,
            location: true,
            type: true,
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

    if (!application) {
      await finishAuditLog(auditId, "FAILURE", auditDetail);
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
        { status: 404 }
      );
    }

    await finishAuditLog(auditId, "SUCCESS", auditDetail);

    return NextResponse.json({ success: true, data: application }, { headers: NO_STORE_HEADERS });
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

    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const rateLimitResponse2 = await checkAdminRateLimit(request, "admin-write", admin.id);
    if (rateLimitResponse2) return rateLimitResponse2;

    if (!validateCSRFToken(request)) return csrfForbiddenResponse();

    // 先获取申请记录以删除关联的简历文件
    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: { resumePath: true, jobId: true },
    });

    if (!application) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
        { status: 404 }
      );
    }

    const auditDetail = {
      jobId: application.jobId,
      hasResume: Boolean(application.resumePath),
    };
    const auditId = await beginAuditLog({
      action: "delete_application",
      targetType: "application",
      targetId: id,
      detail: auditDetail,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
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

    await prisma.jobApplication.delete({ where: { id } }).catch(async (error) => {
      await finishAuditLog(auditId, "FAILURE", auditDetail);
      throw error;
    });

    let resumeFileDeleted = true;
    if (application.resumePath) {
      if (isPrivateResumeKey(application.resumePath)) {
        try {
          await deleteResumeFile(application.resumePath);
        } catch (error) {
          resumeFileDeleted = false;
          apiConsole.error("[AdminApplicationDelete] 私有简历文件删除失败，需人工清理:", {
            applicationId: id,
            error,
          });
        }
      } else {
        resumeFileDeleted = await deleteUploadedFile(application.resumePath).catch((error) => {
          apiConsole.error("[AdminApplicationDelete] 旧公开简历删除失败:", {
            applicationId: id,
            error,
          });
          return false;
        });
      }
    }

    await finishAuditLog(auditId, resumeFileDeleted ? "SUCCESS" : "PARTIAL", {
      ...auditDetail,
      resumeFileDeleted,
    });

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

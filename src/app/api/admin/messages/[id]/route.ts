import { NextRequest, NextResponse } from "next/server";
import { invalidateAdminStats } from "@/lib/admin-stats-invalidate";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { beginAuditLog, createAuditLog, finishAuditLog } from "@/lib/audit";
import { maskPhone } from "@/lib/mask-phone";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";

// 更新留言 Schema
const UpdateSchema = z.object({
  read: z.boolean().optional(),
  internalNote: z.string().max(5000).optional(),
  /** 兼容旧客户端字段，仅用于内部备注 */
  reply: z.string().max(5000).optional(),
  /** 乐观锁：客户端读取到的 updatedAt；不匹配时返回 409，避免多人覆盖备注 */
  expectedUpdatedAt: z.string().datetime().optional(),
});

// GET /api/admin/messages/[id] - 获取留言详情
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

    if (!hasAdminPermission(admin, "messages:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：留言查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const message = await prisma.contactMessage.findUnique({
      where: { id },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "留言不存在" } },
        { status: 404 }
      );
    }

    // 详情默认脱敏；完整号码只能通过 /[id]/reveal（step-up + 严格审计）获取
    return NextResponse.json({
      success: true,
      data: {
        ...message,
        phone: maskPhone(message.phone),
        notedAt: message.notedAt?.toISOString() ?? null,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    apiConsole.error("获取留言详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "获取留言详情失败" } },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/messages/[id] - 更新留言（标记已读）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    if (!hasAdminPermission(admin, "messages:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：留言操作" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const validated = UpdateSchema.parse(body);

    // 检查是否存在
    const existing = await prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "留言不存在" } },
        { status: 404 }
      );
    }

    // 更新留言：空字符串视为清空内部备注（同步清空 notedAt）
    const updateData: Record<string, unknown> = {};
    if (validated.read !== undefined) updateData.read = validated.read;
    const internalNoteInput = validated.internalNote ?? validated.reply;
    if (internalNoteInput !== undefined) {
      const note = internalNoteInput.trim();
      updateData.internalNote = note || null;
      updateData.notedAt = note ? new Date() : null;
    }

    const updated = await prisma.contactMessage.updateMany({
      where: {
        id,
        ...(validated.expectedUpdatedAt
          ? { updatedAt: new Date(validated.expectedUpdatedAt) }
          : {}),
      },
      data: updateData,
    });
    if (updated.count === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "STALE_UPDATE",
            message: "该留言已被其他管理员修改，请刷新后再试",
          },
        },
        { status: 409 }
      );
    }
    const message = await prisma.contactMessage.findUnique({ where: { id } });
    if (!message) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "留言不存在" } },
        { status: 404 }
      );
    }

    invalidateAdminStats();

    createAuditLog({
      action: "update_message",
      targetType: "message",
      targetId: id,
      detail: {
        read: validated.read,
        noted: !!internalNoteInput?.trim(),
      },
      adminId: admin.id,
      request,
    }).catch((error) => apiConsole.error("[AuditLog] 审计写入失败:", error));

    return NextResponse.json({
      success: true,
      data: {
        ...message,
        // 与列表/详情一致：PATCH 响应也不返回明文手机号
        phone: maskPhone(message.phone),
        notedAt: message.notedAt?.toISOString() ?? null,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    apiConsole.error("更新留言失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新留言失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/messages/[id] - 删除留言
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

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    if (!hasAdminPermission(admin, "messages:delete")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：留言删除" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    // 删除留言不可恢复：与产品/职位/简历删除一致，要求 step-up。
    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

    // 检查是否存在
    const existing = await prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "留言不存在" } },
        { status: 404 }
      );
    }

    // 审计写失败则拒绝删除（高危操作不可无痕）。
    const auditDetail = { phone: maskPhone(existing.phone) };
    const auditId = await beginAuditLog({
      action: "delete_message",
      targetType: "message",
      targetId: id,
      detail: auditDetail,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "step_up",
      sessionJti: admin.jti ?? null,
      source: "WEB",
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

    try {
      await prisma.contactMessage.delete({ where: { id } });
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", auditDetail);
      if ((error as { code?: string }).code === "P2025") {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "留言不存在" } },
          { status: 404 }
        );
      }
      throw error;
    }

    await finishAuditLog(auditId, "SUCCESS", auditDetail);
    invalidateAdminStats();

    return NextResponse.json({
      success: true,
      data: { message: "留言已删除" },
    });
  } catch (error) {
    apiConsole.error("删除留言失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "删除留言失败" } },
      { status: 500 }
    );
  }
}

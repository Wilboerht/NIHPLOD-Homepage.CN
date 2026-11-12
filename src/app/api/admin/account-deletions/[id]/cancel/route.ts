/**
 * 管理员撤回冷静期内的注销申请
 * POST /api/admin/account-deletions/:id/cancel
 *
 * 需要 users:delete 权限并通过 step-up；撤回后用户账号恢复可用，不触发匿名化。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { invalidateAdminStats } from "@/lib/admin-stats-invalidate";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { enqueueSecurityActionNotification } from "@/lib/security-notify";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "users:delete")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：撤回注销申请" } },
        { status: 403 }
      );
    }
    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();

    const deletionRequest = await prisma.accountDeletionRequest.findUnique({
      where: { id },
      select: { userId: true, user: { select: { phone: true } } },
    });
    if (!deletionRequest) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "注销申请不存在" } },
        { status: 404 }
      );
    }

    const auditId = await beginAuditLog({
      action: "account_deletion_cancel",
      targetType: "user",
      targetId: deletionRequest.userId,
      detail: { requestId: id, phase: "cancelled" },
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

    const updated = await prisma.accountDeletionRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (updated.count === 0) {
      await finishAuditLog(auditId, "FAILURE", { reason: "NOT_CANCELLABLE" });
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_CANCELLABLE", message: "仅冷静期内的申请可以撤回" },
        },
        { status: 409 }
      );
    }

    await finishAuditLog(auditId, "SUCCESS", { requestId: id });
    invalidateAdminStats();
    await enqueueSecurityActionNotification({
      userId: deletionRequest.userId,
      phone: deletionRequest.user.phone,
      action: "注销申请已撤回",
      reference: `deletion-cancel:${id}`,
    }).catch((error) => apiConsole.warn("[AdminAccountDeletionCancel] 用户通知入队失败:", error));
    return NextResponse.json({ success: true, data: { status: "CANCELLED" } });
  } catch (error) {
    apiConsole.error("[AdminAccountDeletionCancel] 撤回异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

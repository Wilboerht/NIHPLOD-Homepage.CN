/**
 * 审计日志详情
 * GET /api/admin/audit-logs/[id]
 *
 * 列表不返回 detail；这里返回完整详情。查看敏感字段需要
 * audit:sensitive:read + TOTP step-up，且每次查看都留痕。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { getAuditLogById, createAuditLog } from "@/lib/audit";
import { maskAuditDetail, maskAuditText, redactSensitiveAuditDetail } from "@/lib/audit-sanitize";
import { maskIdentifier, maskIp } from "@/lib/mask-phone";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { apiConsole } from "@/lib/logger";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "audit:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计日志查看" } },
        { status: 403 }
      );
    }
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!id || id.length > 64) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ID", message: "无效的日志 ID" } },
        { status: 400 }
      );
    }

    const log = await getAuditLogById(id);
    if (!log) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "审计日志不存在" } },
        { status: 404 }
      );
    }

    const canViewSensitive = hasAdminPermission(admin, "audit:sensitive:read");
    if (canViewSensitive) {
      const stepUp = await requireAdminStepUp(request, admin);
      if (stepUp) return stepUp;
    }

    const sanitized = canViewSensitive
      ? {
          ...log,
          detail: redactSensitiveAuditDetail(log.detail),
          targetLabel: log.targetLabel,
          userAgent: log.userAgent,
        }
      : {
          ...log,
          detail: maskAuditDetail(log.detail),
          targetLabel: log.targetLabel ? maskAuditText(log.targetLabel) : null,
          actorEmail: log.actorEmail ? maskIdentifier(log.actorEmail) : null,
          ipAddress: log.ipAddress ? maskIp(log.ipAddress) : null,
          userAgent: null,
          admin: log.admin
            ? { ...log.admin, email: maskIdentifier(log.admin.email) ?? "-" }
            : null,
        };

    await createAuditLog({
      action: "audit_log_detail_view",
      targetType: "system",
      targetId: log.id,
      targetLabel: log.action,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      sessionJti: admin.jti ?? null,
      source: "WEB",
      detail: {
        auditLogId: log.id,
        viewedSensitive: canViewSensitive,
        action: log.action,
      },
      adminId: admin.id,
      request,
    });

    return NextResponse.json(
      { success: true, data: sanitized },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    apiConsole.error("[AuditLogDetail] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500 }
    );
  }
}

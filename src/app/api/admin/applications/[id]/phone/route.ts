/**
 * 查看候选人完整手机号
 * POST /api/admin/applications/:id/phone
 *
 * 需要 applications:sensitive:read + step-up；严格审计失败则拒绝返回明文。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import prisma from "@/lib/prisma";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { createAuditLogStrict } from "@/lib/audit";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
} as const;

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "applications:sensitive:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：候选人敏感信息查看" } },
        { status: 403 }
      );
    }
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();

    const stepUp = await requireAdminStepUp(request, admin);
    if (stepUp) return stepUp;

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: { id: true, phone: true },
    });
    if (!application) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    try {
      await createAuditLogStrict({
        action: "application_sensitive_view",
        targetType: "application",
        targetId: id,
        detail: { applicationId: id, phone: maskPhone(application.phone) },
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
    } catch (error) {
      apiConsole.error("[AdminApplications] 敏感查看审计失败，拒绝揭示:", error);
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝查看完整号码" },
        },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, data: { phone: application.phone } },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    apiConsole.error("[AdminApplications] 手机号查看异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

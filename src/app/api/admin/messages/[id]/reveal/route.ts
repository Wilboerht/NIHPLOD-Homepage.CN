import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { createAuditLogStrict } from "@/lib/audit";
import { maskPhone } from "@/lib/mask-phone";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
} as const;

/**
 * POST /api/admin/messages/[id]/reveal
 * 揭示留言完整手机号：列表/详情默认脱敏，只有显式揭示才返回明文。
 * 必须 step-up，且审计写入失败时拒绝返回（fail-closed）。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!hasAdminPermission(admin, "messages:sensitive:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：敏感联系方式查看" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();

    const message = await prisma.contactMessage.findUnique({
      where: { id },
      select: { id: true, phone: true },
    });
    if (!message) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "留言不存在" } },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    try {
      await createAuditLogStrict({
        action: "message_sensitive_view",
        targetType: "message",
        targetId: id,
        detail: { messageId: id, phone: maskPhone(message.phone) },
        actorType: "ADMIN",
        actorEmail: admin.email,
        actorName: admin.name,
        actorRole: admin.role,
        authMethod: "step_up",
        sessionJti: admin.jti,
        adminId: admin.id,
        request,
      });
    } catch (error) {
      apiConsole.error("[AdminMessages] 敏感查看审计写入失败，拒绝揭示:", error);
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝查看完整号码" },
        },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, data: { phone: message.phone } },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    apiConsole.error("[AdminMessages] 揭示手机号失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查看完整号码失败" } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

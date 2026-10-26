/**
 * 校验某流某日审计完整性
 * POST /api/admin/audit-integrity/verify { stream, day }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { verifyAuditDay } from "@/lib/audit-integrity";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

export const dynamic = "force-dynamic";

const schema = z.object({
  stream: z.enum(["audit", "sso"]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计查看" } },
        { status: 403 }
      );
    }
    if (!validateCSRFToken(request)) return csrfForbiddenResponse();
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const body = schema.parse(await request.json());
    const result = await verifyAuditDay(body.stream, body.day);

    await createAuditLog({
      action: "audit_integrity_verify",
      targetType: "system",
      targetId: `${body.stream}/${body.day}`,
      targetLabel: `${body.stream} ${body.day}`,
      outcome: result.verified ? "SUCCESS" : "FAILURE",
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      sessionJti: admin.jti ?? null,
      source: "WEB",
      detail: { ...result },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: result }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    apiConsole.error("[AuditIntegrity] verify 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "校验失败" } },
      { status: 500 }
    );
  }
}

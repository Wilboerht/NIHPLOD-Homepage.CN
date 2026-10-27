/**
 * 审计保留期预览（只读）
 * GET /api/admin/audit-retention/preview
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { buildRetentionPreview, defaultRetentionCutoffs } from "@/lib/audit-retention";
import { apiConsole } from "@/lib/logger";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "audit:retention:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计保留预览" } },
        { status: 403 }
      );
    }
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const preview = await buildRetentionPreview({ cutoffs: defaultRetentionCutoffs() });
    return NextResponse.json(
      {
        success: true,
        data: {
          preview,
          enabled: process.env.AUDIT_RETENTION_ENABLED === "true",
          allowLocalOnly: process.env.AUDIT_RETENTION_ALLOW_LOCAL_ONLY === "true",
          canExecute:
            admin.role === "owner" && hasAdminPermission(admin, "audit:retention:execute"),
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    apiConsole.error("[AuditRetention] preview 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "预览失败" } },
      { status: 500 }
    );
  }
}

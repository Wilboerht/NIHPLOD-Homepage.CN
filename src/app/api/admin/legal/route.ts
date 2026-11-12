import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { listAdminLegalDocuments } from "@/lib/legal-document-service";
import { LEGAL_NO_STORE_HEADERS, legalErrorResponse } from "@/lib/legal-document-http";

export const dynamic = "force-dynamic";

/** GET /api/admin/legal - 法务文档状态列表 */
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401, headers: LEGAL_NO_STORE_HEADERS }
      );
    }
    if (!hasAdminPermission(admin, "legal:read") && !hasAdminPermission(admin, "legal:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：法务文档查看" } },
        { status: 403, headers: LEGAL_NO_STORE_HEADERS }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const documents = await listAdminLegalDocuments();
    return NextResponse.json(
      { success: true, data: documents },
      { headers: LEGAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    return legalErrorResponse(error, "获取法务文档列表失败");
  }
}

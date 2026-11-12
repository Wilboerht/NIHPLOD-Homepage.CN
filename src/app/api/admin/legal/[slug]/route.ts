import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { getAdminLegalDocument } from "@/lib/legal-document-service";
import {
  LEGAL_NO_STORE_HEADERS,
  illegalSlugResponse,
  legalErrorResponse,
} from "@/lib/legal-document-http";
import { legalSlugSchema } from "@/schemas/legal";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ slug: string }> };

/** GET /api/admin/legal/[slug] - 文档详情与当前草稿 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    const { slug } = await params;
    const parsedSlug = legalSlugSchema.safeParse(slug);
    if (!parsedSlug.success) return illegalSlugResponse();

    const document = await getAdminLegalDocument(parsedSlug.data);
    return NextResponse.json(
      { success: true, data: document },
      { headers: LEGAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    return legalErrorResponse(error, "获取法务文档失败");
  }
}

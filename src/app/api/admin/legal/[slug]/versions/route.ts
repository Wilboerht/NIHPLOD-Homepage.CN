import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { listLegalVersions } from "@/lib/legal-document-service";
import {
  LEGAL_NO_STORE_HEADERS,
  illegalSlugResponse,
  legalErrorResponse,
} from "@/lib/legal-document-http";
import { legalSlugSchema, legalVersionListQuerySchema } from "@/schemas/legal";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ slug: string }> };

/** GET /api/admin/legal/[slug]/versions - 历史版本列表 */
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

    const searchParams = request.nextUrl.searchParams;
    const parsedQuery = legalVersionListQuerySchema.safeParse({
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "参数错误",
            details: parsedQuery.error.issues,
          },
        },
        { status: 400, headers: LEGAL_NO_STORE_HEADERS }
      );
    }

    const result = await listLegalVersions({
      slug: parsedSlug.data,
      cursor: parsedQuery.data.cursor,
      limit: parsedQuery.data.limit,
    });

    return NextResponse.json({ success: true, data: result }, { headers: LEGAL_NO_STORE_HEADERS });
  } catch (error) {
    return legalErrorResponse(error, "获取法务文档历史版本失败");
  }
}

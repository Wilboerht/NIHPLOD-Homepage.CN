import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { getLegalVersion } from "@/lib/legal-document-service";
import {
  LEGAL_NO_STORE_HEADERS,
  illegalSlugResponse,
  legalErrorResponse,
} from "@/lib/legal-document-http";
import { legalSlugSchema } from "@/schemas/legal";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ slug: string; versionId: string }> };

/** GET /api/admin/legal/[slug]/versions/[versionId] - 版本完整内容 */
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

    const { slug, versionId } = await params;
    const parsedSlug = legalSlugSchema.safeParse(slug);
    if (!parsedSlug.success) return illegalSlugResponse();
    if (!versionId || versionId.length > 64) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ID", message: "非法的版本标识" } },
        { status: 400, headers: LEGAL_NO_STORE_HEADERS }
      );
    }

    const version = await getLegalVersion({
      slug: parsedSlug.data,
      versionId,
    });

    return NextResponse.json({ success: true, data: version }, { headers: LEGAL_NO_STORE_HEADERS });
  } catch (error) {
    return legalErrorResponse(error, "获取法务文档历史版本失败");
  }
}

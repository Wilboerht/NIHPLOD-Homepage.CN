import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { restoreLegalVersionToDraft } from "@/lib/legal-document-service";
import {
  LEGAL_NO_STORE_HEADERS,
  illegalSlugResponse,
  legalErrorResponse,
} from "@/lib/legal-document-http";
import { legalRestoreRequestSchema, legalSlugSchema } from "@/schemas/legal";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ slug: string }> };

/** POST /api/admin/legal/[slug]/restore - 恢复历史版本为草稿（不直接发布） */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    if (!validateCSRFToken(request)) return csrfForbiddenResponse();

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401, headers: LEGAL_NO_STORE_HEADERS }
      );
    }
    if (!hasAdminPermission(admin, "legal:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：法务文档编辑" } },
        { status: 403, headers: LEGAL_NO_STORE_HEADERS }
      );
    }

    const { slug } = await params;
    const parsedSlug = legalSlugSchema.safeParse(slug);
    if (!parsedSlug.success) return illegalSlugResponse();

    const body = await request.json();
    const parsed = legalRestoreRequestSchema.parse(body);

    const document = await restoreLegalVersionToDraft({
      slug: parsedSlug.data,
      versionId: parsed.versionId,
      expectedRevision: parsed.expectedRevision,
      admin: { id: admin.id, email: admin.email, name: admin.name },
      request,
    });

    return NextResponse.json(
      { success: true, data: document },
      { headers: LEGAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    return legalErrorResponse(error, "恢复法务文档历史版本失败");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { parseAdminJsonBody } from "@/lib/request-body";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { discardLegalDraft, saveLegalDraft } from "@/lib/legal-document-service";
import {
  LEGAL_NO_STORE_HEADERS,
  illegalSlugResponse,
  legalErrorResponse,
} from "@/lib/legal-document-http";
import {
  legalDiscardDraftRequestSchema,
  legalDraftSaveRequestSchema,
  legalSlugSchema,
} from "@/schemas/legal";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ slug: string }> };

/** PUT /api/admin/legal/[slug]/draft - 保存草稿 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    const bodyResult = await parseAdminJsonBody(request);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;
    const parsed = legalDraftSaveRequestSchema.parse(body);

    const document = await saveLegalDraft({
      slug: parsedSlug.data,
      content: parsed.content,
      expectedRevision: parsed.expectedRevision,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    });

    return NextResponse.json(
      { success: true, data: document },
      { headers: LEGAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    return legalErrorResponse(error, "保存法务文档草稿失败");
  }
}

/** DELETE /api/admin/legal/[slug]/draft - 丢弃草稿 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const bodyResult = await parseAdminJsonBody(request);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;
    const parsed = legalDiscardDraftRequestSchema.parse(body);

    const document = await discardLegalDraft({
      slug: parsedSlug.data,
      expectedRevision: parsed.expectedRevision,
      admin: { id: admin.id, email: admin.email, name: admin.name },
      request,
    });

    return NextResponse.json(
      { success: true, data: document },
      { headers: LEGAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    return legalErrorResponse(error, "丢弃法务文档草稿失败");
  }
}

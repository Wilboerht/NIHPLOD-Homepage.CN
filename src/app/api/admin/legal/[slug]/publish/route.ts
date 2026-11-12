import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { publishLegalDocument } from "@/lib/legal-document-service";
import { revalidateLegalDocumentCache } from "@/lib/legal-document-cache";
import {
  LEGAL_NO_STORE_HEADERS,
  illegalSlugResponse,
  legalErrorResponse,
} from "@/lib/legal-document-http";
import { legalPublishRequestSchema, legalSlugSchema } from "@/schemas/legal";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ slug: string }> };

/** POST /api/admin/legal/[slug]/publish - 发布新版本（TOTP step-up） */
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
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：法务文档发布" } },
        { status: 403, headers: LEGAL_NO_STORE_HEADERS }
      );
    }

    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

    const { slug } = await params;
    const parsedSlug = legalSlugSchema.safeParse(slug);
    if (!parsedSlug.success) return illegalSlugResponse();

    const body = await request.json();
    const parsed = legalPublishRequestSchema.parse(body);

    const document = await publishLegalDocument({
      slug: parsedSlug.data,
      content: parsed.content,
      expectedRevision: parsed.expectedRevision,
      note: parsed.note,
      admin: { id: admin.id, email: admin.email, name: admin.name },
      request,
    });

    revalidateLegalDocumentCache();

    return NextResponse.json(
      { success: true, data: document },
      { headers: LEGAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    return legalErrorResponse(error, "发布法务文档失败");
  }
}

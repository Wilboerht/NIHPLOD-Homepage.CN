import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { approveApprovalRequest } from "@/lib/admin-approval";
import { approvalErrorResponse } from "@/lib/admin-approval-http";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
} as const;

const bodySchema = z.object({
  totpCode: z.string().trim().min(6, "请输入二次验证码").max(20),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (admin.role !== "owner" || !hasAdminPermission(admin, "approvals:review")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可审批" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "approval:review");
    if (rateLimitResponse) return rateLimitResponse;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: parsed.error.issues[0]?.message || "参数错误",
          },
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { id } = await params;
    const data = await approveApprovalRequest({
      admin,
      id,
      totpCode: parsed.data.totpCode,
      note: parsed.data.note,
    });
    return NextResponse.json({ success: true, data }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return approvalErrorResponse(error);
  }
}

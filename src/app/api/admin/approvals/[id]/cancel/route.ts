import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { cancelApprovalRequest } from "@/lib/admin-approval";
import { approvalErrorResponse } from "@/lib/admin-approval-http";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
} as const;

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
    if (!hasAdminPermission(admin, "approvals:request")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：撤回审批" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "approval:request");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const data = await cancelApprovalRequest(admin, id);
    return NextResponse.json({ success: true, data }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return approvalErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { getApprovalRequestForAdmin } from "@/lib/admin-approval";
import { approvalErrorResponse } from "@/lib/admin-approval-http";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
} as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (
      !hasAdminPermission(admin, "approvals:request") &&
      !hasAdminPermission(admin, "approvals:review")
    ) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审批中心" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!id || id.length > 64) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ID", message: "无效的申请 ID" } },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const record = await getApprovalRequestForAdmin(admin, id);
    return NextResponse.json(
      {
        success: true,
        data: {
          ...record,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
          approvedAt: record.approvedAt?.toISOString() ?? null,
          approvalTotpVerifiedAt: record.approvalTotpVerifiedAt?.toISOString() ?? null,
          executedAt: record.executedAt?.toISOString() ?? null,
          expiresAt: record.expiresAt.toISOString(),
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return approvalErrorResponse(error);
  }
}

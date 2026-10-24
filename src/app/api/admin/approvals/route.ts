import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { listApprovalRequests, createApprovalRequest } from "@/lib/admin-approval";
import { approvalErrorResponse } from "@/lib/admin-approval-http";
import { APPROVAL_POLICY_KEYS } from "@/lib/admin-approval-policy";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
} as const;

const statusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "EXECUTING",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "EXECUTED",
  "EXECUTION_FAILED",
  "STALE",
]);

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: statusSchema.optional(),
  policyKey: z.enum(APPROVAL_POLICY_KEYS).optional(),
});

const createSchema = z.object({
  policyKey: z.enum(APPROVAL_POLICY_KEYS),
  payload: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(5, "请填写至少 5 个字符的申请原因").max(500, "申请原因过长"),
});

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page") || "1",
      pageSize: searchParams.get("pageSize") || "20",
      status: searchParams.get("status") || undefined,
      policyKey: searchParams.get("policyKey") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const data = await listApprovalRequests(admin, parsed.data);
    return NextResponse.json({ success: true, data }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return approvalErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：发起审批" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "approval:request");
    if (rateLimitResponse) return rateLimitResponse;

    const body = createSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: body.error.issues[0]?.message || "参数错误",
          },
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const data = await createApprovalRequest({
      admin,
      policyKey: body.data.policyKey,
      payload: body.data.payload,
      reason: body.data.reason,
    });
    return NextResponse.json({ success: true, data }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return approvalErrorResponse(error);
  }
}

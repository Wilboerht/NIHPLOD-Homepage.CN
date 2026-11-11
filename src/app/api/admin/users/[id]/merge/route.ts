import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import { AccountSecurityError } from "@/lib/admin-account-security";
import { getAccountMergePreflight, mergeUserAccounts } from "@/lib/admin-account-merge";
import { invalidIdResponse, validateCUID } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().cuid();
const mergeSchema = z.object({
  sourceUserId: idSchema,
  expectedSourceUpdatedAt: z.string().datetime(),
  expectedTargetUpdatedAt: z.string().datetime(),
  confirmation: z.literal("MERGE"),
  requestId: z.string().trim().min(8).max(64),
  reason: supportReasonSchema,
});

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const access = await requireAdminSupportAccess(request, "users:merge", {
      write: false,
      stepUp: true,
      rateLimitKey: "user:merge-preflight",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = idSchema.safeParse(new URL(request.url).searchParams.get("sourceUserId"));
    if (!parsed.success) return supportError("INVALID_PARAMS", "请提供有效的源账户 ID");
    const result = await getAccountMergePreflight(parsed.data, id);
    return NextResponse.json(
      { success: true, data: result },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    if (error instanceof AccountSecurityError)
      return supportError(error.code, error.message, error.status);
    apiConsole.error("[AdminAccountMerge] 预检失败:", error);
    return supportError("INTERNAL_ERROR", "账户合并预检失败", 500);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const access = await requireAdminSupportAccess(request, "users:merge", {
      rateLimitKey: "user:merge-execute",
    });
    if (!access.ok) return access.response;
    if (access.admin.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "APPROVAL_REQUIRED",
            message: "非 owner 合并账户必须经 owner 审批",
            details: { policyKey: "user.accounts.merge" },
          },
        },
        { status: 403 }
      );
    }
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = mergeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");
    const result = await mergeUserAccounts({
      ...parsed.data,
      targetUserId: id,
      actor: access.admin,
      operationId: parsed.data.requestId,
      request,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AccountSecurityError)
      return supportError(error.code, error.message, error.status);
    apiConsole.error("[AdminAccountMerge] 执行失败:", error);
    return supportError("INTERNAL_ERROR", "账户合并失败", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import {
  AccountSecurityError,
  changeUserPhoneByAdmin,
  getPhoneChangePreflight,
} from "@/lib/admin-account-security";
import { invalidIdResponse, validateCUID } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号");
const changeSchema = z.object({
  newPhone: phoneSchema,
  expectedPhoneHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: supportReasonSchema,
});

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const access = await requireAdminSupportAccess(request, "users:phone:write", {
      write: false,
      stepUp: true,
      rateLimitKey: "user:phone-preflight",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = phoneSchema.safeParse(new URL(request.url).searchParams.get("newPhone"));
    if (!parsed.success) return supportError("INVALID_PHONE", "请输入正确的新手机号");
    const result = await getPhoneChangePreflight(id, parsed.data);
    return NextResponse.json(
      { success: true, data: result },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    if (error instanceof AccountSecurityError)
      return supportError(error.code, error.message, error.status);
    apiConsole.error("[AdminPhonePreflight] 预检失败:", error);
    return supportError("INTERNAL_ERROR", "手机号换绑预检失败", 500);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const access = await requireAdminSupportAccess(request, "users:phone:write", {
      rateLimitKey: "user:phone-change",
    });
    if (!access.ok) return access.response;
    if (access.admin.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "APPROVAL_REQUIRED",
            message: "非 owner 换绑手机号必须经 owner 审批",
            details: { policyKey: "user.phone.change" },
          },
        },
        { status: 403 }
      );
    }
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = changeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");
    const result = await changeUserPhoneByAdmin({
      userId: id,
      ...parsed.data,
      actor: access.admin,
      request,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AccountSecurityError)
      return supportError(error.code, error.message, error.status);
    apiConsole.error("[AdminPhoneChange] 换绑失败:", error);
    return supportError("INTERNAL_ERROR", "手机号换绑失败", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { apiConsole } from "@/lib/logger";
import { addressFieldsSchema } from "@/lib/user-address";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import { AdminCorrectionError, createUserAddressByAdmin } from "@/lib/admin-user-corrections";
import { invalidIdResponse, validateCUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireAdminSupportAccess(request, "users:write", {
      rateLimitKey: "user:address-correction",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = addressFieldsSchema
      .extend({ reason: supportReasonSchema })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");
    const address = await createUserAddressByAdmin(id, parsed.data, {
      admin: access.admin,
      request,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ success: true, data: { address } });
  } catch (error) {
    if (error instanceof AdminCorrectionError) {
      return supportError(error.code, error.message, error.status);
    }
    apiConsole.error("[AdminUserAddress] 新增失败:", error);
    return supportError("INTERNAL_ERROR", "收货地址新增失败", 500);
  }
}

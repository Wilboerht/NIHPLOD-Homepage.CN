import { NextRequest, NextResponse } from "next/server";
import { apiConsole } from "@/lib/logger";
import { addressFieldsSchema } from "@/lib/user-address";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import {
  AdminCorrectionError,
  deleteUserAddressByAdmin,
  updateUserAddressByAdmin,
} from "@/lib/admin-user-corrections";
import { invalidIdResponse, validateCUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; addressId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const access = await requireAdminSupportAccess(request, "users:write", {
      rateLimitKey: "user:address-correction",
    });
    if (!access.ok) return access.response;
    const { id, addressId } = await params;
    if (!validateCUID(id) || !validateCUID(addressId)) return invalidIdResponse();
    const parsed = addressFieldsSchema
      .extend({ reason: supportReasonSchema })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");
    const address = await updateUserAddressByAdmin(id, addressId, parsed.data, {
      admin: access.admin,
      request,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ success: true, data: { address } });
  } catch (error) {
    if (error instanceof AdminCorrectionError) {
      return supportError(error.code, error.message, error.status);
    }
    apiConsole.error("[AdminUserAddress] 修改失败:", error);
    return supportError("INTERNAL_ERROR", "收货地址修改失败", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const access = await requireAdminSupportAccess(request, "users:write", {
      rateLimitKey: "user:address-correction",
    });
    if (!access.ok) return access.response;
    const { id, addressId } = await params;
    if (!validateCUID(id) || !validateCUID(addressId)) return invalidIdResponse();
    const parsed = supportReasonSchema.safeParse((await request.json().catch(() => ({})))?.reason);
    if (!parsed.success) return supportError("INVALID_PARAMS", "请填写操作原因或工单号");
    await deleteUserAddressByAdmin(id, addressId, {
      admin: access.admin,
      request,
      reason: parsed.data,
    });
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (error instanceof AdminCorrectionError) {
      return supportError(error.code, error.message, error.status);
    }
    apiConsole.error("[AdminUserAddress] 删除失败:", error);
    return supportError("INTERNAL_ERROR", "收货地址删除失败", 500);
  }
}

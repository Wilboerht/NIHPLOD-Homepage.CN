import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { addressFieldsSchema } from "@/lib/user-address";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import { AdminCorrectionError, correctRedemptionRecipient } from "@/lib/admin-user-corrections";
import { invalidIdResponse, validateCUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

const correctionSchema = addressFieldsSchema.extend({
  reason: supportReasonSchema,
  requestId: z.string().trim().min(8).max(64),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireAdminSupportAccess(request, "redemptions:fulfill", {
      rateLimitKey: "redemption:recipient-correction",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = correctionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");
    const result = await correctRedemptionRecipient(id, parsed.data, parsed.data.requestId, {
      admin: access.admin,
      request,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AdminCorrectionError) {
      return supportError(error.code, error.message, error.status);
    }
    apiConsole.error("[AdminRedemptionRecipient] 修改失败:", error);
    return supportError("INTERNAL_ERROR", "兑换收货信息修改失败", 500);
  }
}

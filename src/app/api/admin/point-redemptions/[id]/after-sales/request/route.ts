import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { requestAfterSales } from "@/lib/redemption-state-machine";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import { invalidIdResponse, validateCUID } from "@/lib/validation";
import { isOwnedSpentProofImageRef, isValidSpentProofImageRef } from "@/lib/spent-adjustment-meta";

export const dynamic = "force-dynamic";

const schema = z.object({
  requestId: z.string().trim().min(8).max(64),
  reason: z.string().trim().min(2, "请填写售后原因").max(500),
  images: z
    .array(z.string().max(500).refine(isValidSpentProofImageRef, "凭证图片格式不正确"))
    .max(3)
    .optional(),
  ticketReason: supportReasonSchema,
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireAdminSupportAccess(request, "redemptions:after-sales", {
      rateLimitKey: "redemption-after-sales:proxy-request",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");
    const redemption = await prisma.pointRedemption.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!redemption) return supportError("NOT_FOUND", "兑换记录不存在", 404);
    if (parsed.data.images?.some((image) => !isOwnedSpentProofImageRef(image, redemption.userId))) {
      return supportError("INVALID_IMAGES", "凭证图片不属于该用户");
    }

    const auditId = await beginAuditLog({
      action: "point_redemption_after_sales_request",
      targetType: "point_redemption",
      targetId: id,
      detail: { userId: redemption.userId, reason: parsed.data.ticketReason },
      actorType: "ADMIN",
      actorEmail: access.admin.email,
      actorName: access.admin.name,
      actorRole: access.admin.role,
      authMethod: "step_up",
      adminId: access.admin.id,
      request,
    });
    if (!auditId) return supportError("AUDIT_UNAVAILABLE", "审计不可用，已拒绝操作", 503);
    const result = await requestAfterSales({
      redemptionId: id,
      userId: redemption.userId,
      requestId: parsed.data.requestId,
      reason: parsed.data.reason,
      images: parsed.data.images,
      actorType: "ADMIN",
      actorId: access.admin.id,
    });
    await finishAuditLog(auditId, result.ok ? "SUCCESS" : "FAILURE", {
      status: result.ok ? result.status : null,
      error: result.ok ? null : result.code,
    });
    if (!result.ok) {
      return supportError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : 409);
    }
    return NextResponse.json({ success: true, data: { status: result.status } });
  } catch (error) {
    apiConsole.error("[AdminAfterSalesRequest] 代客申请失败:", error);
    return supportError("INTERNAL_ERROR", "代客申请售后失败", 500);
  }
}

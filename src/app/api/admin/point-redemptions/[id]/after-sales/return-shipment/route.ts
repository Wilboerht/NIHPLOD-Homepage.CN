import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { submitReturnShipment } from "@/lib/redemption-state-machine";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import { invalidIdResponse, validateCUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

const schema = z.object({
  waybillNo: z
    .string()
    .trim()
    .min(8)
    .max(32)
    .regex(/^[A-Za-z0-9-]+$/, "运单号格式不正确"),
  carrier: z.string().trim().min(1).max(20).default("SF"),
  reason: supportReasonSchema,
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireAdminSupportAccess(request, "redemptions:after-sales", {
      rateLimitKey: "redemption-after-sales:proxy-return",
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
    const auditId = await beginAuditLog({
      action: "point_redemption_return_shipment",
      targetType: "point_redemption",
      targetId: id,
      detail: { userId: redemption.userId, reason: parsed.data.reason },
      actorType: "ADMIN",
      actorEmail: access.admin.email,
      actorName: access.admin.name,
      actorRole: access.admin.role,
      authMethod: "step_up",
      adminId: access.admin.id,
      request,
    });
    if (!auditId) return supportError("AUDIT_UNAVAILABLE", "审计不可用，已拒绝操作", 503);
    const result = await submitReturnShipment({
      redemptionId: id,
      userId: redemption.userId,
      waybillNo: parsed.data.waybillNo,
      carrier: parsed.data.carrier,
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
    apiConsole.error("[AdminReturnShipment] 代客填写失败:", error);
    return supportError("INTERNAL_ERROR", "退回运单填写失败", 500);
  }
}

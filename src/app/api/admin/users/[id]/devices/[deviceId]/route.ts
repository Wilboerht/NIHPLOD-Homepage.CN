import { NextRequest, NextResponse } from "next/server";
import { apiConsole } from "@/lib/logger";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { forceLogoutDevice } from "@/lib/security-devices";
import { requireAdminSupportAccess, supportError, supportReasonSchema } from "@/lib/admin-support";
import { invalidIdResponse, validateCUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deviceId: string }> }
) {
  try {
    const access = await requireAdminSupportAccess(request, "users:security:write", {
      rateLimitKey: "user:device-revoke",
    });
    if (!access.ok) return access.response;
    const { id, deviceId } = await params;
    if (!validateCUID(id) || !validateCUID(deviceId)) return invalidIdResponse();
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const parsed = supportReasonSchema.safeParse(body.reason);
    if (!parsed.success) return supportError("INVALID_PARAMS", "请填写操作原因或工单号");
    const auditId = await beginAuditLog({
      action: "user_device_revoke",
      targetType: "user",
      targetId: id,
      detail: { deviceId, reason: parsed.data },
      actorType: "ADMIN",
      actorEmail: access.admin.email,
      actorName: access.admin.name,
      actorRole: access.admin.role,
      authMethod: "step_up",
      adminId: access.admin.id,
      request,
    });
    if (!auditId) return supportError("AUDIT_UNAVAILABLE", "审计不可用，已拒绝操作", 503);
    const result = await forceLogoutDevice({
      userId: id,
      deviceId,
      currentRefreshTokenHash: `admin:${access.admin.id}`,
      blockClientId: "__admin__",
    });
    await finishAuditLog(auditId, result.ok ? "SUCCESS" : "FAILURE", {
      deviceId,
      error: result.ok ? null : result.code,
    });
    if (!result.ok) return supportError(result.code, result.message, result.status);
    return NextResponse.json({ success: true, data: { revoked: true } });
  } catch (error) {
    apiConsole.error("[AdminUserDevice] 撤销失败:", error);
    return supportError("INTERNAL_ERROR", "设备撤销失败", 500);
  }
}

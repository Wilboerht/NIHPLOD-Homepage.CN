import { NextRequest, NextResponse } from "next/server";
import { apiConsole } from "@/lib/logger";
import { listSecurityDevices } from "@/lib/security-devices";
import {
  requireAdminSupportAccess,
  supportError,
  writeAdminSupportAudit,
} from "@/lib/admin-support";
import { invalidIdResponse, validateCUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireAdminSupportAccess(request, "users:security:write", {
      write: false,
      stepUp: true,
      rateLimitKey: "user:devices-read",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const devices = await listSecurityDevices(id, "", null);
    await writeAdminSupportAudit({
      action: "user_devices_view",
      targetType: "user",
      targetId: id,
      detail: { count: devices.length },
      admin: access.admin,
      request,
    });
    return NextResponse.json(
      {
        success: true,
        data: { devices: devices.map((device) => ({ ...device, isCurrent: false })) },
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    apiConsole.error("[AdminUserDevices] 查询失败:", error);
    return supportError("INTERNAL_ERROR", "设备列表查询失败", 500);
  }
}

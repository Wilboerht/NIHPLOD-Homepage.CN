import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission, resolveBaRole } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { baInternalRequest } from "@/lib/ba-internal";
import { mapBaError } from "@/lib/ba-complaints";
import { createAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface ResetEmergencyPasswordData {
  username: string;
  password: string;
  tokenVersion: number;
}

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * 主站 BA 看板：重置 BA 应急账号密码
 * POST /api/admin/subsites/ba/emergency-account/reset-password
 *
 * 权限：ba:admin（owner 天然拥有）+ step-up TOTP。
 * 新密码由 BA 生成，只在本次响应返回一次，主站不落库、不写日志。
 */
export async function POST(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) return jsonError("UNAUTHORIZED", "未授权管理员访问", 401);
  if (!hasAdminPermission(admin, "ba:admin")) {
    return jsonError("FORBIDDEN", "仅 BA 超级管理员可以重置应急密码", 403);
  }

  const rateLimitResponse = await checkAdminRateLimit(request, "admin-write", admin.id);
  if (rateLimitResponse) return rateLimitResponse;

  const stepUpResponse = await requireAdminStepUp(request, admin);
  if (stepUpResponse) return stepUpResponse;

  const result = await baInternalRequest<ResetEmergencyPasswordData>(
    "/api/internal/admin/emergency-account/reset-password",
    {
      method: "POST",
      body: {
        actor: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: resolveBaRole(admin.role, admin.permissionOverrides) ?? admin.role,
        },
      },
      timeoutMs: 8000,
    }
  );
  if (!result.ok) return mapBaError(result);

  await createAuditLog({
    action: "ba_emergency_password_reset",
    targetType: "ba_emergency_account",
    targetId: result.data.username,
    targetLabel: result.data.username,
    detail: { tokenVersion: result.data.tokenVersion },
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    request,
  }).catch((error) =>
    logger.error("[BAEmergencyAccount] 主站审计写入失败", { error: String(error) })
  );

  return NextResponse.json(
    { success: true, data: result.data },
    { headers: { "Cache-Control": "no-store" } }
  );
}

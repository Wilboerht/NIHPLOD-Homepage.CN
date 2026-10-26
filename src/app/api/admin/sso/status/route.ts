import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSsoConfig, isAdminSsoEnabled, safeSecretEqual } from "@/lib/admin-sso";
import { resolveAdvisorRole, resolveAdminPermissions } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { createAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const statusSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  adminIds: z.array(z.string().min(1)).min(1).max(100),
});

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/admin/sso/status
// 子站定时同步影子账号状态/角色/权限版本；仅返回必要字段，不含密码/TOTP 密钥。
export async function POST(request: NextRequest) {
  if (!isAdminSsoEnabled()) {
    return jsonError("NOT_FOUND", "Admin SSO is disabled", 404);
  }

  let config: ReturnType<typeof getAdminSsoConfig>;
  try {
    config = getAdminSsoConfig();
  } catch (error) {
    logger.error("[AdminSSO] 配置缺失", { error: String(error) });
    return jsonError("INTERNAL_ERROR", "Admin SSO is not configured", 500);
  }

  const ip = getClientIP(request);
  const limit = await rateLimit(`admin-sso-status-${ip}`, "default", {
    maxRequests: 120,
    windowMs: 60 * 1000,
  });
  if (!limit.success) {
    return jsonError("RATE_LIMITED", "请求过于频繁，请稍后再试", 429);
  }

  let parsed;
  try {
    parsed = statusSchema.safeParse(await request.json());
  } catch {
    return jsonError("INVALID_REQUEST", "请求格式错误", 400);
  }
  if (!parsed.success) {
    return jsonError("INVALID_REQUEST", "请求参数不完整", 400);
  }

  const { client_id, client_secret, adminIds } = parsed.data;
  if (client_id !== config.clientId || !safeSecretEqual(client_secret, config.clientSecret)) {
    return jsonError("INVALID_CLIENT", "客户端认证失败", 401);
  }

  const ids = Array.from(new Set(adminIds));
  const admins = await prisma.admin.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      tokenVersion: true,
      status: true,
      deletedAt: true,
      totpEnabled: true,
    },
  });

  await createAuditLog({
    action: "admin_sso_status_sync",
    targetType: "admin",
    targetLabel: client_id,
    actorType: "INTEGRATION",
    actorName: client_id,
    authMethod: "client_secret",
    source: "INTEGRATION",
    detail: {
      clientId: client_id,
      requestedIds: ids.length,
      returnedCount: admins.length,
    },
    request,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        admins: admins.map((admin) => ({
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          permissions: resolveAdminPermissions(admin.role, admin.permissions),
          advisorRole: resolveAdvisorRole(admin.role, admin.permissions),
          ver: admin.tokenVersion,
          status: admin.status,
          deletedAt: admin.deletedAt,
          totpEnabled: admin.totpEnabled,
        })),
      },
    },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
  );
}

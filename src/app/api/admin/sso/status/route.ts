import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeSecretEqual } from "@/lib/admin-sso";
import {
  filterClientPermissions,
  getAdminSsoClient,
  resolveClientRole,
} from "@/lib/admin-sso-clients";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

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
  const client = (() => {
    try {
      return getAdminSsoClient(client_id);
    } catch (error) {
      apiConsole.error("[AdminSSO] 配置缺失", error);
      return null;
    }
  })();

  if (!client || !safeSecretEqual(client_secret, client.clientSecret)) {
    return jsonError("INVALID_CLIENT", "客户端认证失败", 401);
  }

  const statusAction =
    client.roleResolver === "ba" ? "ba_admin_sso_status_sync" : "admin_sso_status_sync";

  const ids = Array.from(new Set(adminIds));
  try {
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

    const foundIds = new Set(admins.map((admin) => admin.id));
    const missingIds = ids.filter((id) => !foundIds.has(id));
    const responseAdmins = [
      ...admins.map((admin) => {
        const clientRole = resolveClientRole(client, admin.role, admin.permissions);
        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          permissions: filterClientPermissions(client, admin.role, admin.permissions),
          clientRole,
          advisorRole: client.roleResolver === "advisor" ? clientRole : undefined,
          baRole: client.roleResolver === "ba" ? clientRole : undefined,
          totpEnabled: admin.totpEnabled,
          ver: admin.tokenVersion,
          status: admin.status,
          deletedAt: admin.deletedAt,
        };
      }),
      // 主站已删除的管理员也必须出现在响应中，子站才能撤销影子账号会话。
      ...missingIds.map((id) => ({
        id,
        email: null,
        name: null,
        role: "unknown",
        permissions: [],
        clientRole: null,
        advisorRole: null,
        baRole: null,
        totpEnabled: false,
        ver: 0,
        status: "DELETED",
        deletedAt: new Date().toISOString(),
      })),
    ];

    await createAuditLog({
      action: statusAction,
      targetType: "admin",
      targetLabel: client_id,
      actorType: "INTEGRATION",
      actorName: client_id,
      authMethod: "client_secret",
      source: "INTEGRATION",
      detail: {
        clientId: client_id,
        requestedIds: ids.length,
        returnedCount: responseAdmins.length,
        missingIds: missingIds.length,
      },
      request,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          // 只返回影子账号同步所需的最小字段：客户端相关权限 + TOTP 状态，
          // 不下发主站全量权限集合。
          admins: responseAdmins,
        },
      },
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
    );
  } catch (error) {
    apiConsole.error("[AdminSSOStatus] 查询失败:", error);
    return jsonError("INTERNAL_ERROR", "服务暂时不可用", 503);
  }
}

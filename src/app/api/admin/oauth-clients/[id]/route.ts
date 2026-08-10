/**
 * 管理端单个 OAuth Client API
 * GET    /api/admin/oauth-clients/[id] — 详情
 * PATCH  /api/admin/oauth-clients/[id] — 更新
 * DELETE /api/admin/oauth-clients/[id] — 硬删除（含关联数据级联清理）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import {
  getOAuthClientById,
  updateOAuthClient,
  deleteOAuthClient,
  toSafeClientResponse,
} from "@/lib/oauth-client";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { blacklistUserTokens } from "@/lib/token-blacklist";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (admin.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "仅超级管理员可管理 OAuth Client" },
        },
        { status: 403 }
      );
    }

    const rateLimitResult = await checkAdminRateLimit(request, "admin-oauth-client-detail");
    if (rateLimitResult) return rateLimitResult;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const client = await getOAuthClientById(id);
    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { client: toSafeClientResponse(client) } });
  } catch (error) {
    apiConsole.error("[AdminOAuthClient] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin || admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可操作" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();

    // 更新前获取原状态，用于判断是否需要级联撤销
    const previousClient = await getOAuthClientById(id);
    if (!previousClient) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    const client = await updateOAuthClient(id, body);

    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    // Client 从活跃变为停用时：级联撤销 session/token 并通知 RP
    if (previousClient.isActive && client.isActive === false) {
      try {
        const clientId = client.clientId;

        // 撤销所有活跃 OAuthSession 与 RefreshToken
        await prisma.$transaction(async (tx) => {
          await tx.oAuthSession.updateMany({
            where: { clientId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.refreshToken.updateMany({
            where: { clientId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        });

        // 通知所有受影响用户登出（按 userId 去重，减少请求）
        const affectedSessions = await prisma.oAuthSession.findMany({
          where: { clientId },
          select: { userId: true },
          distinct: ["userId"],
        });

        for (const { userId } of affectedSessions) {
          await sendBackchannelLogout(userId, [clientId], { includeInactive: true });
        }
      } catch (err) {
        apiConsole.error("[AdminOAuthClient PATCH] 停用 Client 级联撤销失败:", err);
      }
    }

    await createAuditLog({
      action: "oauth_client_update",
      targetType: "oauth_client",
      targetId: id,
      detail: { changes: body, clientId: client.clientId },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { client: toSafeClientResponse(client) } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    apiConsole.error("[AdminOAuthClient PATCH] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin || admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可操作" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const client = await getOAuthClientById(id);
    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    // 级联撤销：通知所有活跃用户并撤销 session，发送 Backchannel Logout
    const activeSessions = await prisma.oAuthSession.findMany({
      where: { clientId: client.clientId, revokedAt: null },
      select: { userId: true },
    });
    if (activeSessions.length > 0) {
      await prisma.oAuthSession.updateMany({
        where: { clientId: client.clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.refreshToken.updateMany({
        where: { clientId: client.clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const userIds = [...new Set(activeSessions.map((s) => s.userId))];
      for (const userId of userIds) {
        await blacklistUserTokens(userId, "oauth_client_deleted").catch(() => {});
        await sendBackchannelLogout(userId, [client.clientId], { includeInactive: true });
      }
    }

    const deleted = await deleteOAuthClient(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在或已删除" } },
        { status: 404 }
      );
    }

    await createAuditLog({
      action: "oauth_client_delete",
      targetType: "oauth_client",
      targetId: id,
      detail: { clientId: client.clientId, name: client.name },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { message: "Client 已删除" } });
  } catch (error) {
    apiConsole.error("[AdminOAuthClient DELETE] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

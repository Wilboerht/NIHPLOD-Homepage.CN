/**
 * 会话管理 API
 * GET    /api/admin/oauth/sessions — 聚合查询活跃 OAuthSession + RefreshToken
 * POST   /api/admin/oauth/sessions — 终止指定会话
 * DELETE /api/admin/oauth/sessions — 批量终止所有活跃会话
 *
 * 权限：仅 owner 角色可操作
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { recordSsoEvent } from "@/lib/sso-audit";
import { getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin || admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可查看" } },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10), 100);
    const userId = searchParams.get("userId") || undefined;
    const clientId = searchParams.get("clientId") || undefined;

    // 活跃 OAuthSession
    const sessionWhere: Record<string, unknown> = { revokedAt: null };
    if (userId) sessionWhere.userId = userId;
    if (clientId) sessionWhere.clientId = clientId;

    const [sessions, total] = await Promise.all([
      prisma.oAuthSession.findMany({
        where: sessionWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.oAuthSession.count({ where: sessionWhere }),
    ]);

    // 活跃 RefreshToken 数量
    const refreshTokenCount = await prisma.refreshToken.count({
      where: { revokedAt: null },
    });

    // 批量获取用户信息
    const userIds = [...new Set(sessions.map((s) => s.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, phone: true, nickname: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    // 批量获取 client 名称
    const clientIds = [...new Set(sessions.map((s) => s.clientId))];
    const clients = clientIds.length > 0
      ? await prisma.oAuthClient.findMany({
          where: { clientId: { in: clientIds } },
          select: { clientId: true, name: true },
        })
      : [];
    const clientMap = new Map(clients.map((c) => [c.clientId, c.name]));

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          activeSessions: total,
          activeRefreshTokens: refreshTokenCount,
        },
        items: sessions.map((s) => {
          const u = userMap.get(s.userId);
          return {
            id: s.id,
            userId: s.userId,
            phone: u?.phone ? u.phone.slice(0, 3) + "****" + u.phone.slice(-4) : null,
            nickname: u?.nickname || null,
            clientId: s.clientId,
            clientName: clientMap.get(s.clientId) || s.clientId,
            scopes: s.scopes,
            createdAt: s.createdAt.toISOString(),
            expiresAt: s.expiresAt.toISOString(),
          };
        }),
        pagination: { page, pageSize, total },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthSessions GET] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

const terminateSchema = z.object({
  userId: z.string().min(1),
  clientId: z.string().optional(),
});

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const parsed = terminateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { userId, clientId } = parsed.data;
    const ip = getClientIP(request);

    const sessionWhere: Record<string, unknown> = { userId, revokedAt: null };
    if (clientId) sessionWhere.clientId = clientId;

    // 查询所有将被撤销的 session
    const sessions = await prisma.oAuthSession.findMany({
      where: sessionWhere,
      select: { id: true, clientId: true },
    });

    if (sessions.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "未找到活跃会话" } },
        { status: 404 }
      );
    }

    // 撤销 OAuthSession
    await prisma.oAuthSession.updateMany({
      where: sessionWhere,
      data: { revokedAt: new Date() },
    });

    // 撤销 RefreshToken
    if (clientId) {
      // 按 client 终止：仅影响该 client 的 refresh token
    } else {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    // Backchannel Logout 通知
    const uniqueClientIds = [...new Set(sessions.map((s) => s.clientId))];
    await sendBackchannelLogout(userId, uniqueClientIds);

    recordSsoEvent({
      event: "status_change",
      userId,
      ip,
      success: true,
      detail: { action: "session_terminated", sessionCount: sessions.length, clientId },
    });

    await createAuditLog({
      action: "oauth_session_terminate",
      targetType: "oauth_session",
      targetId: userId,
      detail: { userId, clientId, sessionCount: sessions.length },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: { terminatedCount: sessions.length },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthSessions POST] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    // 查询所有活跃会话用于 backchannel logout
    const activeSessions = await prisma.oAuthSession.findMany({
      where: { revokedAt: null },
      select: { userId: true, clientId: true },
    });

    // 批量撤销
    const [sessionResult, refreshResult] = await Promise.all([
      prisma.oAuthSession.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Backchannel Logout：按用户聚合
    const userClients = new Map<string, Set<string>>();
    for (const s of activeSessions) {
      if (!userClients.has(s.userId)) userClients.set(s.userId, new Set());
      userClients.get(s.userId)!.add(s.clientId);
    }
    for (const [userId, clients] of userClients) {
      await sendBackchannelLogout(userId, [...clients]);
    }

    await createAuditLog({
      action: "oauth_session_terminate",
      targetType: "oauth_session",
      targetId: "all",
      detail: { sessionsRevoked: sessionResult.count, refreshTokensRevoked: refreshResult.count },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionsRevoked: sessionResult.count,
        refreshTokensRevoked: refreshResult.count,
      },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthSessions DELETE] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * 会话管理 API
 * GET    /api/admin/oauth/sessions — 聚合查询活跃 OAuthSession + RefreshToken
 * POST   /api/admin/oauth/sessions — 终止指定会话
 * DELETE /api/admin/oauth/sessions — 批量终止所有活跃会话
 *
 * 权限：仅 owner 角色可操作
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { recordSsoEvent } from "@/lib/sso-audit";
import { getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { revokeRefreshToken } from "@/lib/auth-security";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

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
    const search = searchParams.get("search") || undefined;

    // 模糊搜索：匹配用户手机号/昵称 或 Client ID/名称
    let searchOr: Record<string, unknown>[] | undefined;
    if (search) {
      const [matchedUsers, matchedClients] = await Promise.all([
        prisma.user.findMany({
          where: {
            OR: [
              { phone: { contains: search } },
              { nickname: { contains: search, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        }),
        prisma.oAuthClient.findMany({
          where: {
            OR: [
              { clientId: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          },
          select: { clientId: true },
        }),
      ]);
      const userIds = matchedUsers.map((u) => u.id);
      const clientIds = matchedClients.map((c) => c.clientId);

      searchOr = [];
      if (userIds.length > 0) searchOr.push({ userId: { in: userIds } });
      if (clientIds.length > 0) searchOr.push({ clientId: { in: clientIds } });

      if (searchOr.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            stats: { activeSessions: 0, activeRefreshTokens: 0 },
            items: [],
            pagination: { page, pageSize, total: 0 },
          },
        });
      }
    }

    // 活跃 OAuthSession（排除已过期但未标记撤销的记录）
    const sessionWhere: Record<string, unknown> = { revokedAt: null, expiresAt: { gt: new Date() } };
    if (userId) sessionWhere.userId = userId;
    if (clientId) sessionWhere.clientId = clientId;
    if (searchOr) sessionWhere.OR = searchOr;

    const [sessions, total] = await Promise.all([
      prisma.oAuthSession.findMany({
        where: sessionWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.oAuthSession.count({ where: sessionWhere }),
    ]);

    // 活跃 RefreshToken 数量（同样排除已过期记录）
    const refreshTokenCount = await prisma.refreshToken.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    });

    // 批量获取用户信息
    const userIds = [...new Set(sessions.map((s) => s.userId))];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, phone: true, nickname: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    // 批量获取 client 名称
    const clientIds = [...new Set(sessions.map((s) => s.clientId))];
    const clients =
      clientIds.length > 0
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
            phone:
              u?.phone && u.phone.length >= 7
                ? u.phone.slice(0, 3) + "****" + u.phone.slice(-4)
                : u?.phone || null,
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

// 两种模式显式互斥：strict 拒绝多余字段，避免 z.union 静默丢弃字段
const terminateSchema = z.union([
  z
    .object({
      sessionId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      userId: z.string().min(1),
      clientId: z.string().optional(),
    })
    .strict(),
]);

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-oauth-sessions");
    if (rateLimitResponse) return rateLimitResponse;

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

    const ip = getClientIP(request);

    // 模式 A：精确终止单条 session
    if ("sessionId" in parsed.data) {
      const { sessionId } = parsed.data;

      const session = await prisma.oAuthSession.findUnique({
        where: { id: sessionId },
        select: { id: true, userId: true, clientId: true, revokedAt: true },
      });

      if (!session || session.revokedAt) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "未找到活跃会话" } },
          { status: 404 }
        );
      }

      // 撤销指定 OAuthSession
      await prisma.oAuthSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });

      // 同步撤销该用户+client 下的活跃 RefreshToken
      await revokeRefreshToken(session.userId, undefined, session.clientId);

      // 已签发 access token 的即时失效由 sid 会话校验承担（verifyOAuthAccessToken 按
      // sid 查到本 session 的 revokedAt 即拒绝），不再拉黑用户全部 token，
      // 避免误登出主站会话。

      // Backchannel Logout 通知
      await sendBackchannelLogout(session.userId, [session.clientId]);

      await recordSsoEvent({
        event: "status_change",
        userId: session.userId,
        clientId: session.clientId,
        ip,
        success: true,
        detail: { action: "session_terminated", sessionId, terminatedCount: 1 },
      });

      await createAuditLog({
        action: "oauth_session_terminate",
        targetType: "oauth_session",
        targetId: sessionId,
        detail: {
          userId: session.userId,
          clientId: session.clientId,
          sessionId,
          terminatedCount: 1,
        },
        adminId: admin.id,
        request,
      });

      return NextResponse.json({
        success: true,
        data: { terminatedCount: 1 },
      });
    }

    // 模式 B：按 userId (+ clientId) 批量终止该用户全部或某 Client 下的会话
    const { userId, clientId } = parsed.data;

    const sessionWhere: Record<string, unknown> = { userId, revokedAt: null };
    if (clientId) sessionWhere.clientId = clientId;

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

    await prisma.oAuthSession.updateMany({
      where: sessionWhere,
      data: { revokedAt: new Date() },
    });

    await revokeRefreshToken(userId, undefined, clientId);

    // 已签发 access token 的即时失效由 sid 会话校验承担（verifyOAuthAccessToken 按
    // sid 查到 OAuthSession.revokedAt 即拒绝），不再拉黑用户全部 token，避免误登出主站会话。

    const uniqueClientIds = [...new Set(sessions.map((s) => s.clientId))];
    await sendBackchannelLogout(userId, uniqueClientIds);

    await recordSsoEvent({
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

    // 速率限制：批量终止所有会话属高风险操作
    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "请求格式错误" } },
        { status: 400 }
      );
    }
    if (!body.confirm) {
      return NextResponse.json(
        { success: false, error: { code: "CONFIRM_REQUIRED", message: "请确认此操作" } },
        { status: 400 }
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

    // Backchannel Logout：按用户聚合通知；已签发 access token 的即时失效由
    // sid 会话校验承担（verifyOAuthAccessToken 按 sid 查到 revokedAt 即拒绝），
    // 不再逐用户拉黑 token，避免误登出主站会话。
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

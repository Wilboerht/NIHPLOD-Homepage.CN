/**
 * 管理端 OAuth Client CRUD API
 * GET  /api/admin/oauth-clients — 分页列表
 * POST /api/admin/oauth-clients — 创建新 Client
 *
 * 权限：仅 owner 角色可操作
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { z } from "zod";
import { createOAuthClient, listOAuthClients, toSafeClientResponse } from "@/lib/oauth-client";
import { createAuditLog } from "@/lib/audit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 为每个 client 填充使用统计（容错：聚合查询失败时返回 0/null 而非 500） */
async function enrichClientsWithStats(
  clients: Awaited<ReturnType<typeof listOAuthClients>>["clients"]
) {
  const clientIds = clients.map((c) => c.clientId);

  if (clientIds.length === 0) return clients;

  let sessionMap = new Map<string, number>();
  let activityMap = new Map<string, string | null>();

  // 聚合每个 client 的活跃用户数（有效 session 数）
  try {
    const sessionCounts = await prisma.oAuthSession.groupBy({
      by: ["clientId"],
      where: {
        clientId: { in: clientIds },
        revokedAt: null,
        // 与会话管理页口径一致：已过期但未标记撤销的不计为活跃
        expiresAt: { gt: new Date() },
      },
      _count: { userId: true },
    });
    sessionMap = new Map(sessionCounts.map((s) => [s.clientId, s._count.userId]));
  } catch (err) {
    apiConsole.warn("[enrichClientsWithStats] 活跃用户统计查询失败，返回 0:", err);
  }

  // 聚合每个 client 的最近活跃时间
  try {
    const lastActivities = await prisma.ssoAuditEvent.groupBy({
      by: ["clientId"],
      where: {
        clientId: { in: clientIds },
        success: true,
      },
      _max: { createdAt: true },
    });
    activityMap = new Map(
      lastActivities.map((a) => [a.clientId!, a._max.createdAt?.toISOString() || null])
    );
  } catch (err) {
    apiConsole.warn("[enrichClientsWithStats] 最近活跃时间查询失败，返回 null:", err);
  }

  return clients.map((c) => ({
    ...c,
    activeUserCount: sessionMap.get(c.clientId) || 0,
    lastActiveAt: activityMap.get(c.clientId) || null,
  }));
}

export async function GET(request: NextRequest) {
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

    // 速率限制：OAuth Client 列表含敏感配置信息
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 30, windowMs: 60 * 1000 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10), 100);
    const search = searchParams.get("search") || undefined;

    const result = await listOAuthClients({ page, pageSize, search });

    // 填充使用统计
    const enrichedClients = await enrichClientsWithStats(result.clients);

    return NextResponse.json({
      success: true,
      data: {
        clients: enrichedClients,
        pagination: { page, pageSize, total: result.total },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthClients] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

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

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const result = await createOAuthClient(body);

    // SSO 审计：client 生命周期变更（合规敏感，同步等待写入）
    await recordSsoEvent({
      event: "status_change",
      clientId: result.client.clientId,
      clientName: result.client.name,
      ip: getClientIP(request),
      success: true,
      detail: { action: "client_created", scopes: result.client.scopes },
    });

    await createAuditLog({
      action: "oauth_client_create",
      targetType: "oauth_client",
      targetId: result.client.id,
      detail: { name: result.client.name, clientId: result.client.clientId },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        client: toSafeClientResponse(result.client),
        // 明文 secret 仅在创建时返回一次
        plainSecret: result.plainSecret,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: error.issues },
        },
        { status: 400 }
      );
    }
    apiConsole.error("[AdminOAuthClients POST] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * 用户授权管理 API
 * GET  /api/admin/oauth/consents — 分页查询用户授权列表
 * POST /api/admin/oauth/consents — 管理员吊销用户授权
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
    const search = searchParams.get("search") || undefined;
    const clientId = searchParams.get("clientId") || undefined;
    const status = searchParams.get("status") || undefined; // active | revoked

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;

    if (status === "active") {
      where.revokedAt = null;
    } else if (status === "revoked") {
      where.revokedAt = { not: null };
    }

    if (search) {
      // 通过 phone 搜索用户
      const users = await prisma.user.findMany({
        where: { phone: { contains: search } },
        select: { id: true },
      });
      where.userId = { in: users.map((u) => u.id) };
    }

    const [items, total] = await Promise.all([
      prisma.oAuthSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          userId: true,
          clientId: true,
          scopes: true,
          createdAt: true,
          revokedAt: true,
        },
      }),
      prisma.oAuthSession.count({ where }),
    ]);

    // 批量获取用户信息
    const userIds = [...new Set(items.map((i) => i.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, phone: true, nickname: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    // 批量获取 client 名称
    const clientIds = [...new Set(items.map((i) => i.clientId))];
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
        items: items.map((item) => {
          const u = userMap.get(item.userId);
          return {
            id: item.id,
            userId: item.userId,
            phone: u?.phone ? maskForList(u.phone) : null,
            nickname: u?.nickname || null,
            clientId: item.clientId,
            clientName: clientMap.get(item.clientId) || item.clientId,
            scopes: item.scopes,
            grantedAt: item.createdAt.toISOString(),
            revokedAt: item.revokedAt?.toISOString() || null,
            status: item.revokedAt ? "revoked" : "active",
          };
        }),
        pagination: { page, pageSize, total },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthConsents GET] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

const revokeSchema = z.object({
  userId: z.string().min(1),
  clientId: z.string().min(1),
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
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { userId, clientId } = parsed.data;
    const ip = getClientIP(request);

    // 撤销所有活跃 session
    const result = await prisma.oAuthSession.updateMany({
      where: { userId, clientId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "未找到活跃授权" } },
        { status: 404 }
      );
    }

    // 同步撤销 UserConsent，确保授权状态一致性
    await prisma.userConsent.upsert({
      where: { userId_clientId: { userId, clientId } },
      update: { revokedAt: new Date() },
      create: {
        userId,
        clientId,
        scopes: [],
        revokedAt: new Date(),
      },
    });

    // 记录 SSO 审计事件
    recordSsoEvent({
      event: "consent",
      userId,
      clientId,
      ip,
      success: true,
      detail: { action: "admin_revoke", sessionCount: result.count },
    });

    // 触发 Backchannel Logout
    await sendBackchannelLogout(userId, [clientId]);

    await createAuditLog({
      action: "oauth_consent_revoke",
      targetType: "oauth_consent",
      targetId: `${userId}:${clientId}`,
      detail: { userId, clientId, sessionCount: result.count },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { revokedCount: result.count } });
  } catch (error) {
    apiConsole.error("[AdminOAuthConsents POST] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

function maskForList(phone: string): string {
  if (phone.length < 7) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

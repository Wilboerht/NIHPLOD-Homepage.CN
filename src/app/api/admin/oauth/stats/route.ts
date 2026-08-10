/**
 * SSO 概览统计 API
 * GET /api/admin/oauth/stats
 *
 * 返回：活跃客户端数、活跃授权数、今日/本周/本月事件数、授权成功率
 * 权限：仅 owner 角色可操作
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

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

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - todayStart.getDay() * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      activeClients,
      activeSessions,
      activeRefreshTokens,
      todayEvents,
      weekEvents,
      monthEvents,
      successfulEvents,
      totalEvents,
    ] = await Promise.all([
      prisma.oAuthClient.count({ where: { isActive: true } }),
      prisma.oAuthSession.count({ where: { revokedAt: null } }),
      prisma.refreshToken.count({ where: { revokedAt: null } }),
      prisma.ssoAuditEvent.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.ssoAuditEvent.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.ssoAuditEvent.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.ssoAuditEvent.count({
        where: { createdAt: { gte: monthStart }, success: true },
      }),
      prisma.ssoAuditEvent.count({
        where: { createdAt: { gte: monthStart } },
      }),
    ]);

    // 按事件类型统计本月事件
    const eventsByType = await prisma.ssoAuditEvent.groupBy({
      by: ["event"],
      where: { createdAt: { gte: monthStart } },
      _count: { event: true },
      orderBy: { _count: { event: "desc" } },
    });

    return NextResponse.json({
      success: true,
      data: {
        activeClients,
        activeSessions,
        activeRefreshTokens,
        events: {
          today: todayEvents,
          thisWeek: weekEvents,
          thisMonth: monthEvents,
        },
        successRate: totalEvents > 0 ? Math.round((successfulEvents / totalEvents) * 100) : 100,
        eventsByType: Object.fromEntries(eventsByType.map((e) => [e.event, e._count.event])),
      },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthStats] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * SSO 概览统计（单一数据来源）
 *
 * 仪表盘与 /api/admin/oauth/stats 共用，确保同名字段口径一致：
 * - 日/周/月边界统一按 UTC+8（站点主时区），周首为周一
 * - 活跃会话 = 未撤销且未过期
 * - 授权成功率 = 本月 authorize 事件的成功占比（无数据返回 null）
 */
import { prisma } from "./prisma";

export interface SsoOverview {
  activeClients: number;
  activeSessions: number;
  activeRefreshTokens: number;
  events: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  successRate: number | null;
  eventsByType: Record<string, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 当天 UTC+8 零点（返回 UTC Date） */
export function getUtc8DayStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), -8, 0, 0, 0)
  );
}

/** 本周一 UTC+8 零点（周一为周首） */
export function getUtc8WeekStartMonday(now: Date = new Date()): Date {
  const dayStart = getUtc8DayStart(now);
  // getUTCDay：0=周日。转换为 0=周一
  const day = (dayStart.getUTCDay() + 6) % 7;
  return new Date(dayStart.getTime() - day * DAY_MS);
}

/** 本月 1 日 UTC+8 零点 */
export function getUtc8MonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, -8, 0, 0, 0));
}

export async function getSsoOverview(): Promise<SsoOverview> {
  const now = new Date();
  const todayStart = getUtc8DayStart(now);
  const weekStart = getUtc8WeekStartMonday(now);
  const monthStart = getUtc8MonthStart(now);

  const [
    activeClients,
    activeSessions,
    activeRefreshTokens,
    todayEvents,
    weekEvents,
    monthEvents,
    authorizeTotal,
    authorizeSuccess,
    eventsByType,
  ] = await Promise.all([
    prisma.oAuthClient.count({ where: { isActive: true } }),
    prisma.oAuthSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    prisma.refreshToken.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    prisma.ssoAuditEvent.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.ssoAuditEvent.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.ssoAuditEvent.count({ where: { createdAt: { gte: monthStart } } }),
    // 成功率仅统计 authorize：其他事件（status_change 恒成功）会虚高指标
    prisma.ssoAuditEvent.count({
      where: { createdAt: { gte: monthStart }, event: "authorize" },
    }),
    prisma.ssoAuditEvent.count({
      where: { createdAt: { gte: monthStart }, event: "authorize", success: true },
    }),
    prisma.ssoAuditEvent.groupBy({
      by: ["event"],
      where: { createdAt: { gte: monthStart } },
      _count: { event: true },
      orderBy: { _count: { event: "desc" } },
    }),
  ]);

  return {
    activeClients,
    activeSessions,
    activeRefreshTokens,
    events: {
      today: todayEvents,
      thisWeek: weekEvents,
      thisMonth: monthEvents,
    },
    successRate:
      authorizeTotal > 0 ? Math.round((authorizeSuccess / authorizeTotal) * 100) : null,
    eventsByType: Object.fromEntries(eventsByType.map((e) => [e.event, e._count.event])),
  };
}

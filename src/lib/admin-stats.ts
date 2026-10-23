/**
 * 管理员仪表盘统计数据
 *
 * 使用方：Server Component src/app/(admin)/admin/page.tsx
 *
 * 安全要求：服务端必须按当前管理员的有效权限裁剪返回字段，
 * 不能因为拥有 dashboard:read 就把留言/用户/商品/职位数据一并返回。
 *
 * 口径说明：站内没有订单/支付，产品均为站外购买链接。
 * 这里的“消费补录”仅代表用户站外消费申报/同步，用于会员等级与积分，不代表站内营收。
 */
import { unstable_cache } from "next/cache";
import prisma from "./prisma";
import { getSsoOverview } from "./sso-overview";
import { hasAdminPermission } from "./admin-permissions";
import type { AdminUser } from "@/types/auth";
import { getUtc8DateKey, getUtc8DayStart, getUtc8WeekStartMonday } from "./timezone";
import {
  buildAdminStatsData,
  type AdminStatsData,
  type AdminStatsSnapshot,
} from "./admin-stats-data";

export type { AdminStatsData, AdminStatsSnapshot, RecentMessageRecord } from "./admin-stats-data";

export interface SsoStatsData {
  activeClients: number;
  activeSessions: number;
  todayEvents: number;
  /** 本月 authorize 成功率；无授权事件时为 null（展示为 —） */
  successRate: number | null;
}

const STATS_REVALIDATE = parseInt(process.env.ADMIN_STATS_CACHE_TTL ?? "", 10) || 300;
const STATS_CACHE_TAGS = ["admin-stats"];

const toIsoString = (value: Date | null | undefined): string | undefined =>
  value ? value.toISOString() : undefined;

/** 仅缓存聚合计数（不含留言内容等 PII） */
const getCachedCounts = unstable_cache(
  async (_: string): Promise<AdminStatsSnapshot> => {
    const now = new Date();
    const dayStart = getUtc8DayStart(now);
    const weekStart = getUtc8WeekStartMonday(now);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      productsCount,
      categoriesCount,
      draftProductsCount,
      jobsCount,
      totalUsersCount,
      newUsersTodayCount,
      totalMessagesCount,
      messagesTodayCount,
      unreadMessagesAgg,
      pendingSpentAgg,
      pendingRedemptionsAgg,
      pendingApplicationsAgg,
      newApplicationsThisWeekCount,
      failedAccountDeletionsCount,
      webhookFailuresCount,
      cronFailures24hCount,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.category.count(),
      prisma.product.count({ where: { published: false } }),
      prisma.job.count({ where: { published: true } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.contactMessage.count(),
      prisma.contactMessage.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.contactMessage.aggregate({
        _count: true,
        _min: { createdAt: true },
        where: { read: false },
      }),
      prisma.spentAdjustmentApplication.aggregate({
        _count: true,
        _min: { createdAt: true },
        _sum: { amountClaimed: true },
        where: { status: "PENDING" },
      }),
      prisma.pointRedemption.aggregate({
        _count: true,
        _min: { createdAt: true },
        where: { status: "PENDING" },
      }),
      prisma.jobApplication.aggregate({
        _count: true,
        _min: { createdAt: true },
        where: { status: "pending" },
      }),
      prisma.jobApplication.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.accountDeletionRequest.count({ where: { status: "FAILED" } }),
      prisma.webhookDeliveryFailure.count(),
      prisma.cronTaskRun.count({ where: { success: false, startedAt: { gte: last24h } } }),
    ]);

    return {
      productsCount,
      categoriesCount,
      draftProductsCount,
      jobsCount,
      totalUsersCount,
      newUsersTodayCount,
      totalMessagesCount,
      messagesTodayCount,
      unreadMessagesCount: unreadMessagesAgg._count,
      unreadMessagesOldestAt: toIsoString(unreadMessagesAgg._min.createdAt),
      pendingSpentAdjustmentsCount: pendingSpentAgg._count,
      pendingSpentAmount: pendingSpentAgg._sum.amountClaimed ?? 0,
      pendingSpentAdjustmentsOldestAt: toIsoString(pendingSpentAgg._min.createdAt),
      pendingRedemptionsCount: pendingRedemptionsAgg._count,
      pendingRedemptionsOldestAt: toIsoString(pendingRedemptionsAgg._min.createdAt),
      pendingApplicationsCount: pendingApplicationsAgg._count,
      pendingApplicationsOldestAt: toIsoString(pendingApplicationsAgg._min.createdAt),
      newApplicationsThisWeekCount,
      failedAccountDeletionsCount,
      webhookFailuresCount,
      cronFailures24hCount,
    };
  },
  ["admin-stats-counts-v4"],
  { revalidate: STATS_REVALIDATE, tags: [...STATS_CACHE_TAGS] }
);

/** 最近留言含姓名/内容，只有 messages:read 才查询并返回 */
const getCachedRecentMessages = unstable_cache(
  async (_: string) => {
    return prisma.contactMessage.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        content: true,
        read: true,
        createdAt: true,
      },
    });
  },
  ["admin-stats-recent-messages-v2"],
  { revalidate: STATS_REVALIDATE, tags: [...STATS_CACHE_TAGS] }
);

/**
 * 获取当前管理员可见的仪表盘统计数据。
 * 无权限的域不会返回（留言内容仅在 messages:read 时查询）。
 */
export async function getAdminStats(admin: AdminUser): Promise<AdminStatsData> {
  const dateKey = getUtc8DateKey();
  const canReadMessages = hasAdminPermission(admin, "messages:read");

  const [counts, recentMessages] = await Promise.all([
    getCachedCounts(dateKey),
    canReadMessages ? getCachedRecentMessages(dateKey) : Promise.resolve(undefined),
  ]);

  return buildAdminStatsData(admin, counts, recentMessages);
}

const getCachedSsoStats = unstable_cache(
  async () => {
    const overview = await getSsoOverview();
    return {
      activeClients: overview.activeClients,
      activeSessions: overview.activeSessions,
      todayEvents: overview.events.today,
      successRate: overview.successRate,
    };
  },
  ["admin-dashboard-sso-stats"],
  { revalidate: STATS_REVALIDATE, tags: ["admin-sso-stats"] }
);

/** 获取管理员仪表盘 SSO 统计数据 */
export async function getSsoStats(): Promise<SsoStatsData> {
  return getCachedSsoStats();
}

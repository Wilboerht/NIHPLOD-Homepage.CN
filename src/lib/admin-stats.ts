/**
 * 管理员仪表盘统计数据
 *
 * 使用方：Server Component src/app/(admin)/admin/page.tsx
 *
 * 安全要求：服务端必须按当前管理员的有效权限裁剪返回字段，
 * 不能因为拥有 dashboard:read 就把留言/用户/商品/职位数据一并返回。
 */
import { unstable_cache } from "next/cache";
import prisma from "./prisma";
import { getSsoOverview } from "./sso-overview";
import { hasAdminPermission, type AdminPermission } from "./admin-permissions";
import type { AdminUser } from "@/types/auth";
import { getUtc8DateKey } from "./timezone";

const STATS_REVALIDATE = parseInt(process.env.ADMIN_STATS_CACHE_TTL ?? "", 10) || 300;

export interface AdminStatsData {
  products?: number;
  categories?: number;
  unreadMessages?: number;
  jobs?: number;
  totalUsers?: number;
  recentMessages?: {
    id: string;
    name: string;
    phone: string;
    content: string;
    read: boolean;
    createdAt: string;
  }[];
  /** 待审核消费补录数（spent:read 可见） */
  pendingSpentAdjustments?: number;
  /** 待履约积分兑换数（redemptions:read 可见） */
  pendingRedemptions?: number;
  /** 注销失败人工队列数（users:read 可见） */
  failedAccountDeletions?: number;
  /** Webhook 失败队列条数（webhooks:read 可见） */
  webhookFailures?: number;
}

export interface SsoStatsData {
  activeClients: number;
  activeSessions: number;
  todayEvents: number;
  /** 本月 authorize 成功率；无授权事件时为 null（展示为 —） */
  successRate: number | null;
}

const STATS_CACHE_TAGS = ["admin-stats"];

/** 仅缓存聚合计数（不含留言内容等 PII） */
const getCachedCounts = unstable_cache(
  async (_: string) => {
    const [
      productsCount,
      categoriesCount,
      unreadMessagesCount,
      jobsCount,
      totalUsers,
      pendingSpentAdjustmentsCount,
      pendingRedemptionsCount,
      failedAccountDeletionsCount,
      webhookFailuresCount,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.category.count(),
      prisma.contactMessage.count({ where: { read: false } }),
      prisma.job.count({ where: { published: true } }),
      prisma.user.count(),
      prisma.spentAdjustmentApplication.count({ where: { status: "PENDING" } }),
      prisma.pointRedemption.count({ where: { status: "PENDING" } }),
      prisma.accountDeletionRequest.count({ where: { status: "FAILED" } }),
      prisma.webhookDeliveryFailure.count(),
    ]);

    return {
      productsCount,
      categoriesCount,
      unreadMessagesCount,
      jobsCount,
      totalUsers,
      pendingSpentAdjustmentsCount,
      pendingRedemptionsCount,
      failedAccountDeletionsCount,
      webhookFailuresCount,
    };
  },
  ["admin-stats-counts-v3"],
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

const maskPhone = (phone: string) => phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");

/**
 * 获取当前管理员可见的仪表盘统计数据。
 * 无权限的域不会查询/返回（留言内容仅在 messages:read 时查询）。
 */
export async function getAdminStats(admin: AdminUser): Promise<AdminStatsData> {
  const can = (permission: AdminPermission) => hasAdminPermission(admin, permission);
  const dateKey = getUtc8DateKey();

  const [counts, recentMessages] = await Promise.all([
    getCachedCounts(dateKey),
    can("messages:read") ? getCachedRecentMessages(dateKey) : Promise.resolve(undefined),
  ]);

  const data: AdminStatsData = {};

  if (can("users:read")) {
    data.totalUsers = counts.totalUsers;
    data.failedAccountDeletions = counts.failedAccountDeletionsCount;
  }
  if (can("products:read")) data.products = counts.productsCount;
  if (can("categories:read")) data.categories = counts.categoriesCount;
  if (can("jobs:read")) data.jobs = counts.jobsCount;
  if (can("spent:read")) data.pendingSpentAdjustments = counts.pendingSpentAdjustmentsCount;
  if (can("redemptions:read")) data.pendingRedemptions = counts.pendingRedemptionsCount;
  if (can("webhooks:read")) data.webhookFailures = counts.webhookFailuresCount;

  if (can("messages:read")) {
    data.unreadMessages = counts.unreadMessagesCount;
    data.recentMessages = (recentMessages ?? []).map((msg) => ({
      ...msg,
      phone: maskPhone(msg.phone),
      createdAt: new Date(msg.createdAt).toISOString(),
    }));
  }

  return data;
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

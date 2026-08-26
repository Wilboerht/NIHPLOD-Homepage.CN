/**
 * 管理员仪表盘统计数据
 *
 * 该函数同时被以下两处使用：
 * - API 路由：src/app/api/admin/stats/route.ts
 * - Server Component：src/app/(admin)/admin/page.tsx
 *
 * 通过共享函数保持数据逻辑单一来源，避免重复查询。
 */
import { unstable_cache } from "next/cache";
import prisma from "./prisma";

function getTodayUTC8(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), -8, 0, 0, 0));
}

function getMonthStartUTC8(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, -8, 0, 0, 0));
}

const STATS_REVALIDATE = parseInt(process.env.ADMIN_STATS_CACHE_TTL ?? "", 10) || 300;

export interface AdminStatsData {
  products: number;
  categories: number;
  unreadMessages: number;
  jobs: number;
  totalUsers: number;
  recentMessages: {
    id: string;
    name: string;
    phone: string;
    content: string;
    read: boolean;
    createdAt: string;
  }[];
}

export interface SsoStatsData {
  activeClients: number;
  activeSessions: number;
  todayEvents: number;
  successRate: number;
}

const STATS_CACHE_TAGS = ["admin-stats"];

const getCachedStats = unstable_cache(
  async (_: string) => {
    const [productsCount, categoriesCount, unreadMessagesCount, jobsCount, totalUsers, recentMessages] =
      await Promise.all([
        prisma.product.count(),
        prisma.category.count(),
        prisma.contactMessage.count({ where: { read: false } }),
        prisma.job.count({ where: { published: true } }),
        prisma.user.count(),
        prisma.contactMessage.findMany({
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
        }),
      ]);

    return {
      productsCount,
      categoriesCount,
      unreadMessagesCount,
      jobsCount,
      totalUsers,
      recentMessages,
    };
  },
  STATS_CACHE_TAGS,
  { revalidate: STATS_REVALIDATE, tags: [...STATS_CACHE_TAGS] }
);

const maskPhone = (phone: string) => phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");

/**
 * 获取管理员仪表盘统计数据
 */
export async function getAdminStats(): Promise<AdminStatsData> {
  const today = new Date();
  const dateStr = `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;

  const {
    productsCount,
    categoriesCount,
    unreadMessagesCount,
    jobsCount,
    totalUsers,
    recentMessages,
  } = await getCachedStats(dateStr);

  return {
    products: productsCount,
    categories: categoriesCount,
    unreadMessages: unreadMessagesCount,
    jobs: jobsCount,
    totalUsers,
    recentMessages: recentMessages.map((msg) => ({
      ...msg,
      phone: maskPhone(msg.phone),
      createdAt: new Date(msg.createdAt).toISOString(),
    })),
  };
}

const getCachedSsoStats = unstable_cache(
  async () => {
    const todayStart = getTodayUTC8();
    const monthStart = getMonthStartUTC8();

    const [activeClients, activeSessions, todayEvents, successfulEvents, totalEvents] =
      await Promise.all([
        prisma.oAuthClient.count({ where: { isActive: true } }),
        prisma.oAuthSession.count({ where: { revokedAt: null } }),
        prisma.ssoAuditEvent.count({ where: { createdAt: { gte: todayStart } } }),
        prisma.ssoAuditEvent.count({
          where: { createdAt: { gte: monthStart }, success: true },
        }),
        prisma.ssoAuditEvent.count({
          where: { createdAt: { gte: monthStart } },
        }),
      ]);

    return {
      activeClients,
      activeSessions,
      todayEvents,
      successRate: totalEvents > 0 ? Math.round((successfulEvents / totalEvents) * 100) : 100,
    };
  },
  ["admin-dashboard-sso-stats"],
  { revalidate: STATS_REVALIDATE, tags: ["admin-sso-stats"] }
);

/**
 * 获取管理员仪表盘 SSO 统计数据
 */
export async function getSsoStats(): Promise<SsoStatsData> {
  return getCachedSsoStats();
}

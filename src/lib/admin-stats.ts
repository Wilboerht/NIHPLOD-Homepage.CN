/**
 * 管理员仪表盘统计数据
 *
 * 使用方：Server Component src/app/(admin)/admin/page.tsx
 *
 * 通过共享函数保持数据逻辑单一来源，避免重复查询。
 */
import { unstable_cache } from "next/cache";
import prisma from "./prisma";
import { getSsoOverview } from "./sso-overview";

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
  /** 本月 authorize 成功率；无授权事件时为 null（展示为 —） */
  successRate: number | null;
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
    // 与 SSO 统计页共用同一函数，避免同名字段口径（是否含过期/成功率分母/时区）不一致
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

/**
 * 获取管理员仪表盘 SSO 统计数据
 */
export async function getSsoStats(): Promise<SsoStatsData> {
  return getCachedSsoStats();
}

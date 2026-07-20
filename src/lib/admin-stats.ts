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
import { OrderStatus } from "@/generated/prisma/client";
import prisma from "./prisma";

export interface AdminStatsData {
  products: number;
  categories: number;
  unreadMessages: number;
  jobs: number;
  totalUsers: number;
  pendingOrders: number;
  paidOrders: number;
  refundingOrders: number;
  todayRevenue: number;
  recentMessages: {
    id: string;
    name: string;
    phone: string;
    content: string;
    read: boolean;
    createdAt: string;
  }[];
  recentOrders: {
    id: string;
    orderNo: string;
    status: string;
    payAmount: number;
    createdAt: string;
  }[];
}

const getCachedStats = unstable_cache(
  async (dateStr: string) => {
    const todayStart = new Date(dateStr);
    todayStart.setHours(0, 0, 0, 0);

    const [
      productsCount,
      categoriesCount,
      unreadMessagesCount,
      jobsCount,
      totalUsers,
      pendingOrders,
      paidOrders,
      refundingOrders,
      todayRevenueData,
      recentMessages,
      recentOrders,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.category.count(),
      prisma.contactMessage.count({ where: { read: false } }),
      prisma.job.count({ where: { published: true } }),
      prisma.user.count(),
      prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      prisma.order.count({ where: { status: OrderStatus.PAID } }),
      prisma.order.count({ where: { status: OrderStatus.REFUNDING } }),
      prisma.order.aggregate({
        where: {
          paymentTime: { gte: todayStart },
          status: {
            in: [
              OrderStatus.PAID,
              OrderStatus.PROCESSING,
              OrderStatus.SHIPPED,
              OrderStatus.DELIVERED,
              OrderStatus.COMPLETED,
            ],
          },
        },
        _sum: { payAmount: true },
      }),
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
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNo: true,
          status: true,
          payAmount: true,
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
      pendingOrders,
      paidOrders,
      refundingOrders,
      todayRevenueData,
      recentMessages,
      recentOrders,
    };
  },
  ["admin-dashboard-stats"],
  { revalidate: 300, tags: ["admin-stats"] }
);

const maskPhone = (phone: string) => phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");

/**
 * 获取管理员仪表盘统计数据
 */
export async function getAdminStats(): Promise<AdminStatsData> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

  const {
    productsCount,
    categoriesCount,
    unreadMessagesCount,
    jobsCount,
    totalUsers,
    pendingOrders,
    paidOrders,
    refundingOrders,
    todayRevenueData,
    recentMessages,
    recentOrders,
  } = await getCachedStats(dateStr);

  return {
    products: productsCount,
    categories: categoriesCount,
    unreadMessages: unreadMessagesCount,
    jobs: jobsCount,
    totalUsers,
    pendingOrders,
    paidOrders,
    refundingOrders,
    todayRevenue: Number(todayRevenueData._sum.payAmount) || 0,
    recentMessages: recentMessages.map((msg) => ({
      ...msg,
      phone: maskPhone(msg.phone),
      createdAt: new Date(msg.createdAt).toISOString(),
    })),
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      payAmount: Number(order.payAmount),
      createdAt: new Date(order.createdAt).toISOString(),
    })),
  };
}

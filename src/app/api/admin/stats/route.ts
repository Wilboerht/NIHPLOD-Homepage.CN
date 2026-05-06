import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { OrderStatus } from "@/generated/prisma/client";

// 统计数据响应类型
interface StatsResponse {
  success: boolean;
  data?: {
    products: number;
    categories: number;
    unreadMessages: number;
    jobs: number;
    // 电商统计
    totalUsers: number;
    pendingOrders: number;   // 待支付
    paidOrders: number;      // 已支付待发货
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
  };
  error?: {
    code: string;
    message: string;
  };
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
      prisma.order.count({ where: { status: OrderStatus.PENDING } }),   // 待支付
      prisma.order.count({ where: { status: OrderStatus.PAID } }),      // 已支付待发货
      prisma.order.count({ where: { status: OrderStatus.REFUNDING } }),
      prisma.order.aggregate({
        where: {
          paymentTime: { gte: todayStart },
          status: { in: [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
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

// GET /api/admin/stats - 获取仪表盘统计数据
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 验证认证
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json<StatsResponse>(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "未授权访问",
          },
        },
        { status: 401 }
      );
    }

    // 生成当天日期字符串（自然切分每天的缓存边界）
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

    // 通过具有 5分钟 revalidate 特性的封装函数并获取统计数据
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

    return NextResponse.json<StatsResponse>({
      success: true,
      data: {
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
          createdAt: new Date(msg.createdAt).toISOString(),
        })),
        recentOrders: recentOrders.map((order) => ({
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          payAmount: Number(order.payAmount),
          createdAt: new Date(order.createdAt).toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("获取统计数据失败:", error);
    return NextResponse.json<StatsResponse>(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "获取统计数据失败",
        },
      },
      { status: 500 }
    );
  }
}


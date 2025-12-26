import { NextRequest, NextResponse } from "next/server";
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
    pendingOrders: number;
    refundingOrders: number;
    todayRevenue: number;
    recentMessages: {
      id: string;
      name: string;
      email: string;
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

// GET /api/admin/stats - 获取仪表盘统计数据
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

    // 今日开始时间
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 并行获取统计数据
    const [
      productsCount,
      categoriesCount,
      unreadMessagesCount,
      jobsCount,
      totalUsers,
      pendingOrders,
      refundingOrders,
      todayRevenueData,
      recentMessages,
      recentOrders,
    ] = await Promise.all([
      // 产品总数
      prisma.product.count(),
      // 分类总数
      prisma.category.count(),
      // 未读留言数
      prisma.contactMessage.count({
        where: { read: false },
      }),
      // 职位总数（已发布）
      prisma.job.count({
        where: { published: true },
      }),
      // 用户总数
      prisma.user.count(),
      // 待发货订单 (已支付待处理)
      prisma.order.count({
        where: { status: OrderStatus.PAID },
      }),
      // 退款中订单
      prisma.order.count({
        where: { status: OrderStatus.REFUNDING },
      }),
      // 今日销售额
      prisma.order.aggregate({
        where: {
          paymentTime: { gte: todayStart },
          status: { in: [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
        },
        _sum: { payAmount: true },
      }),
      // 最近5条留言
      prisma.contactMessage.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          content: true,
          read: true,
          createdAt: true,
        },
      }),
      // 最近5个订单
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

    return NextResponse.json<StatsResponse>({
      success: true,
      data: {
        products: productsCount,
        categories: categoriesCount,
        unreadMessages: unreadMessagesCount,
        jobs: jobsCount,
        totalUsers,
        pendingOrders,
        refundingOrders,
        todayRevenue: Number(todayRevenueData._sum.payAmount) || 0,
        recentMessages: recentMessages.map((msg) => ({
          ...msg,
          createdAt: msg.createdAt.toISOString(),
        })),
        recentOrders: recentOrders.map((order) => ({
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          payAmount: Number(order.payAmount),
          createdAt: order.createdAt.toISOString(),
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


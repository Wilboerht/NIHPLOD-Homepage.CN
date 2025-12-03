import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

// 统计数据响应类型
interface StatsResponse {
  success: boolean;
  data?: {
    products: number;
    categories: number;
    unreadMessages: number;
    jobs: number;
    recentMessages: {
      id: string;
      name: string;
      email: string;
      content: string;
      read: boolean;
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

    // 并行获取统计数据
    const [
      productsCount,
      categoriesCount,
      unreadMessagesCount,
      jobsCount,
      recentMessages,
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
    ]);

    return NextResponse.json<StatsResponse>({
      success: true,
      data: {
        products: productsCount,
        categories: categoriesCount,
        unreadMessages: unreadMessagesCount,
        jobs: jobsCount,
        recentMessages: recentMessages.map((msg) => ({
          ...msg,
          createdAt: msg.createdAt.toISOString(),
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


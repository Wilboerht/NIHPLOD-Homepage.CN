import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { getAdminStats } from "@/lib/admin-stats";

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
    pendingOrders: number; // 待支付
    paidOrders: number; // 已支付待发货
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

// GET /api/admin/stats - 获取仪表盘统计数据
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

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

    // 速率限制
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default");
    if (!limitResult.success) {
      return NextResponse.json<StatsResponse>(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "请求过于频繁，请稍后再试",
          },
        },
        { status: 429 }
      );
    }

    const data = await getAdminStats();

    return NextResponse.json<StatsResponse>({
      success: true,
      data,
    });
  } catch (error) {
    apiConsole.error("获取统计数据失败:", error);
    return NextResponse.json<StatsResponse>(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "获取统计数据失败",
        },
      },
      { status: 500 }
    );
  }
}

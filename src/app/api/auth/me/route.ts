/**
 * 获取当前用户信息 API
 * GET /api/auth/me
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 验证用户 Token
    const payload = await verifyUserAuth(request);

    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "请先登录",
          },
        },
        { status: 401 }
      );
    }

    // 获取用户详细信息
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        createdAt: true,
        _count: {
          select: {
            orders: true,
            addresses: true,

          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "用户不存在",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
          createdAt: user.createdAt,
          stats: {
            orderCount: user._count.orders,
            addressCount: user._count.addresses,

          },
        },
      },
    });
  } catch (error) {
    apiConsole.error("[GetMe] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务器错误",
        },
      },
      { status: 500 }
    );
  }
}


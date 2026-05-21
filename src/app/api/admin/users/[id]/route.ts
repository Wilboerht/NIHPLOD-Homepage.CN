/**
 * 管理端用户详情 API
 * GET /api/admin/users/:id
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        orders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNo: true,
            status: true,
            payAmount: true,
            createdAt: true,
          },
        },
        addresses: {
          orderBy: { isDefault: "desc", createdAt: "desc" },
          select: {
            id: true,
            name: true,
            phone: true,
            province: true,
            city: true,
            district: true,
            detail: true,
            isDefault: true,
          },
        },
        userCoupons: {
          where: { status: "UNUSED" },
          select: {
            id: true,
            coupon: {
              select: {
                name: true,
                type: true,
                value: true,
              },
            },
          },
        },
        _count: { select: { orders: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    apiConsole.error("[AdminUserDetail] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


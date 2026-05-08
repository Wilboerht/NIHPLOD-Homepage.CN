/**
 * 单个订单 API
 * GET /api/orders/:id - 获取订单详情
 * 
 * ⚠️ GET 请求必须是幂等的、无副作用的。
 * 订单超时取消由定时任务 autoCancelExpiredOrders 独占处理，
 * 本接口只查询并返回状态，不修改任何数据。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";

// 订单超时时间（30分钟）
const ORDER_TIMEOUT_MINUTES = 30;

type RouteContext = { params: Promise<{ id: string }> };

// 获取订单详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const order = await prisma.order.findFirst({
      where: { id, userId: payload.id },
      include: {
        items: true,
        userCoupon: {
          include: { coupon: true }
        }
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "订单不存在" } },
        { status: 404 }
      );
    }

    // 计算是否已超时（仅用于前端展示提示，不修改数据库）
    const isExpired =
      order.status === "PENDING" &&
      new Date(order.createdAt).getTime() + ORDER_TIMEOUT_MINUTES * 60 * 1000 < Date.now();

    return NextResponse.json({
      success: true,
      data: {
        order: {
          ...order,
          // 前端可根据此字段提示用户"订单已超时，请重新下单"
          isExpired,
        },
      },
    });
  } catch (error) {
    console.error("[GetOrder] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

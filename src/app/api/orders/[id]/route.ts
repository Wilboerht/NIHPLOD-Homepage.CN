/**
 * 单个订单 API
 * GET /api/orders/:id - 获取订单详情
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

    let order = await prisma.order.findFirst({
      where: { id, userId: payload.id },
      include: {
        items: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "订单不存在" } },
        { status: 404 }
      );
    }

    // 检查是否超时未付款，自动取消（含库存恢复 + 优惠券释放）
    if (order.status === "PENDING") {
      const timeoutDate = new Date(Date.now() - ORDER_TIMEOUT_MINUTES * 60 * 1000);
      if (order.createdAt < timeoutDate) {
        // ✅ 在事务内完整执行：恢复库存 + 释放优惠券 + 更新订单状态
        await prisma.$transaction(async (tx) => {
          // 重新查询确认订单仍是 PENDING（防止与定时任务并发冲突）
          const freshOrder = await tx.order.findUnique({
            where: { id: order!.id },
            include: { items: true },
          });
          if (!freshOrder || freshOrder.status !== "PENDING") return;

          // 恢复每个商品的库存
          for (const item of freshOrder.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }

          // 释放被锁定的优惠券（如果有）
          const lockedCoupon = await tx.userCoupon.findFirst({
            where: { orderId: freshOrder.id, status: "LOCKED" },
          });
          if (lockedCoupon) {
            await tx.userCoupon.update({
              where: { id: lockedCoupon.id },
              data: { status: "UNUSED" },
            });
          }

          // 更新订单状态为已取消
          await tx.order.update({
            where: { id: freshOrder.id },
            data: { status: "CANCELLED" },
          });
        });

        // 重新查询已更新的订单返回给前端
        order = await prisma.order.findFirst({
          where: { id, userId: payload.id },
          include: { items: true },
        });
        console.log(`[Order] 订单 ${order?.orderNo} 超时自动取消（库存已恢复）`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { order },
    });
  } catch (error) {
    console.error("[GetOrder] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


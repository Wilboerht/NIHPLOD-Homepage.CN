/**
 * 订单 API
 * GET /api/orders - 获取订单列表
 * POST /api/orders - 创建订单
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { createOrder } from "@/lib/order";
import { z } from "zod";

// 订单超时时间（30分钟）
const ORDER_TIMEOUT_MINUTES = 30;

// 创建订单参数验证
const createOrderSchema = z.object({
  addressId: z.string().min(1, "请选择收货地址"),
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    quantity: z.number().int().min(1),
  })).min(1, "请选择商品"),
  remark: z.string().max(200).optional(),
});

/**
 * 自动取消超时未付款的订单
 * @param userId 用户ID（可选，不传则处理所有用户）
 */
async function cancelTimeoutOrders(userId?: string) {
  const timeoutDate = new Date(Date.now() - ORDER_TIMEOUT_MINUTES * 60 * 1000);

  const where: Record<string, unknown> = {
    status: "PENDING",
    createdAt: { lt: timeoutDate },
  };

  if (userId) {
    where.userId = userId;
  }

  // 批量更新超时订单为已取消状态
  const result = await prisma.order.updateMany({
    where,
    data: { status: "CANCELLED" },
  });

  if (result.count > 0) {
    console.log(`[Order] 已自动取消 ${result.count} 个超时订单`);
  }

  return result.count;
}

// 获取订单列表
export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);

    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    // 先自动取消该用户的超时订单
    await cancelTimeoutOrders(payload.id);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");
    const status = searchParams.get("status");

    // 构建查询条件
    const where: Record<string, unknown> = { userId: payload.id };
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: {
            select: {
              id: true,
              productName: true,
              productImage: true,
              price: true,
              quantity: true,
              subtotal: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        orders,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("[GetOrders] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// 创建订单
export async function POST(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    const result = createOrderSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { addressId, items, remark } = result.data;

    // 创建订单
    const orderResult = await createOrder(payload.id, addressId, items, remark);

    if (!orderResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "ORDER_FAILED", message: orderResult.error } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: orderResult.orderId,
        orderNo: orderResult.orderNo,
      },
    });
  } catch (error) {
    console.error("[CreateOrder] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


/**
 * 订单 API
 * GET /api/orders - 获取订单列表
 * POST /api/orders - 创建订单
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { createOrder } from "@/lib/order";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { dualRateLimit, getClientIP } from "@/lib/ratelimit";

// 创建订单参数验证
const createOrderSchema = z.object({
  addressId: z.string().optional(),
  recipient: z.object({
    name: z.string(),
    phone: z.string(),
    address: z.string(),
  }).optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1).max(99),
  })).min(1, "请选择商品").max(50, "单次最多结算50件商品")
    .refine((items) => {
      const ids = items.map(i => i.productId);
      return ids.length === new Set(ids).size;
    }, { message: "商品不能重复", path: ["items"] }),
  remark: z.string().max(200).optional(),
  userCouponId: z.string().optional(),
  source: z.enum(["cart", "direct_buy"]).optional(),
}).refine(data => data.addressId || data.recipient, {
  message: "请提供收货地址ID或完整的收货信息",
  path: ["addressId"], // Error path
});

// 强制动态渲染
export const dynamic = 'force-dynamic';

// 获取订单列表（支持分页）
export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);

    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as import("@/generated/prisma/client").OrderStatus | null | 'all';

    // 分页参数（默认第1页，每页10条）
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));
    const skip = (page - 1) * pageSize;

    // 定义订单状态过滤条件
    const whereClause: import("@/generated/prisma/client").Prisma.OrderWhereInput = { userId: payload.id };
    if (status && status !== "all") {
      whereClause.status = status;
    }

    // 并行查询数据和总数
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        include: {
          items: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: pageSize,
      }),
      prisma.order.count({ where: whereClause }),
    ]);

    console.log(`[GetOrders] User ${payload.id}: page=${page} total=${total}`);

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
    console.error("[GetOrders] Error Details:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "获取订单失败" } },
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

    // 速率限制：每用户每分钟最多创建 10 个订单
    const clientIP = getClientIP(request);
    const rateLimitResult = await dualRateLimit(
      clientIP,
      payload.id,
      "order-create",
      "order-create-user"
    );
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "创建订单过于频繁，请稍后再试" } },
        { status: 429 }
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

    const { addressId, recipient, items, remark, userCouponId, source } = result.data;

    // 创建订单
    const orderResult = await createOrder(
      payload.id,
      items,
      { addressId, recipient },
      remark,
      userCouponId,
      source
    );

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
    logError("CreateOrder", error, { body: await request.clone().text().catch(() => "unreadable") });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

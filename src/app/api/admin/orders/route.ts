/**
 * 管理端订单列表 API
 * GET /api/admin/orders
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { OrderStatus } from "@/generated/prisma/client";
import { z } from "zod";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  status: z.string().nullish(),
  search: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status: searchParams.get("status"),
      search: searchParams.get("search"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    // 构建查询条件
    const where: Record<string, unknown> = {};

    if (params.status && params.status !== "all") {
      where.status = params.status as OrderStatus;
    }

    if (params.search) {
      where.OR = [
        { orderNo: { contains: params.search } },
        { user: { phone: { contains: params.search } } },
        { user: { nickname: { contains: params.search } } },
      ];
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(params.startDate);
      }
      if (params.endDate) {
        const endDate = new Date(params.endDate);
        endDate.setHours(23, 59, 59, 999);
        (where.createdAt as Record<string, Date>).lte = endDate;
      }
    }

    // 查询订单
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, nickname: true, phone: true, avatar: true } },
          items: { take: 1, select: { productName: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        orders: orders.map((order) => ({
          ...order,
          createdAt: order.createdAt.toISOString(),
          shippedAt: order.shippedAt?.toISOString(),
        })),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.ceil(total / params.pageSize),
        },
      },
    });
  } catch (error) {
    console.error("[AdminOrders] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


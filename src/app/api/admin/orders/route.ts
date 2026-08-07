/**
 * 管理端订单列表 API
 * GET /api/admin/orders
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { OrderStatus } from "@/generated/prisma/client";
import { maskPhone } from "@/lib/mask-phone";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  status: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    z.enum(["all", ...Object.values(OrderStatus)] as [string, ...string[]]).default("all")
  ),
  search: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    z.string().max(100).optional()
  ),
  startDate: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    z.coerce.date().optional()
  ),
  endDate: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    z.coerce.date().optional()
  ),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    // 速率限制：防止订单列表被高频爬取（含用户手机号等 PII）
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 60, windowMs: 60 * 1000 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" } },
        { status: 429 }
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
    const isExport = searchParams.get("export") === "csv";

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
        skip: isExport ? undefined : (params.page - 1) * params.pageSize,
        take: isExport ? 10000 : params.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, nickname: true, phone: true, avatar: true } },
          items: { select: { productName: true, quantity: true, price: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    // CSV 导出（财务数据，按当前筛选条件导出全部）
    if (isExport) {
      const escapeCSV = (val: string): string => {
        const sanitized = /^[=+\-@]/.test(val) ? `'${val}` : val;
        if (/[",\n\r]/.test(sanitized)) {
          return `"${sanitized.replace(/"/g, '""')}"`;
        }
        return sanitized;
      };

      const csvHeaders =
        "订单号,状态,实付金额,商品,用户昵称,手机号,创建时间,发货时间\n";
      const csvRows = orders.map((order) =>
        [
          escapeCSV(order.orderNo),
          escapeCSV(order.status),
          Number(order.payAmount).toFixed(2),
          escapeCSV(order.items.map((i) => `${i.productName}x${i.quantity}`).join("; ")),
          escapeCSV(order.user?.nickname || ""),
          escapeCSV(order.user?.phone ? maskPhone(order.user.phone) : ""),
          order.createdAt.toISOString(),
          order.shippedAt?.toISOString() || "",
        ].join(",")
      ).join("\n");

      return new NextResponse(csvHeaders + csvRows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

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
    apiConsole.error("[AdminOrders] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

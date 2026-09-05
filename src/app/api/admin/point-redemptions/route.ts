/**
 * 积分兑换记录 API（管理端）
 * GET /api/admin/point-redemptions - 兑换记录列表（按状态筛选 + 分页）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  status: z.enum(["PENDING", "FULFILLED", "CANCELLED"]).optional(),
});

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

    const rateLimitResponse = await checkAdminRateLimit(request, "point-redemptions:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status: searchParams.get("status") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { page, pageSize, status } = parsed.data;
    const where = status ? { status } : {};

    const [redemptions, total, statusCounts, pointsAgg] = await Promise.all([
      prisma.pointRedemption.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          productName: true,
          priceYuan: true,
          points: true,
          status: true,
          recipient: true,
          phone: true,
          address: true,
          carrier: true,
          waybillNo: true,
          createdAt: true,
          fulfilledAt: true,
          user: { select: { id: true, phone: true, nickname: true } },
        },
      }),
      prisma.pointRedemption.count({ where }),
      prisma.pointRedemption.groupBy({ by: ["status"], _count: true }),
      // 全站可用积分总额（所有用户 PointBalance.available 之和，可为负：含退款超兑债务）
      prisma.pointBalance.aggregate({ _sum: { available: true } }),
    ]);

    const counts: Record<string, number> = { PENDING: 0, FULFILLED: 0, CANCELLED: 0 };
    for (const row of statusCounts) {
      counts[row.status] = row._count;
    }

    return NextResponse.json({
      success: true,
      data: {
        redemptions: redemptions.map((r) => ({
          id: r.id,
          productName: r.productName,
          priceYuan: Number(r.priceYuan),
          points: r.points,
          status: r.status,
          recipient: r.recipient,
          phone: r.phone,
          address: r.address,
          carrier: r.carrier,
          waybillNo: r.waybillNo,
          createdAt: r.createdAt.toISOString(),
          fulfilledAt: r.fulfilledAt?.toISOString() ?? null,
          user: {
            id: r.user.id,
            phone: maskPhone(r.user.phone),
            nickname: r.user.nickname,
          },
        })),
        counts,
        pointsTotal: pointsAgg._sum.available ?? 0,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminPointRedemptions] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

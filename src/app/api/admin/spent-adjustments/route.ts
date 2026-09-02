/**
 * 消费补录审核 API（管理端）
 * GET /api/admin/spent-adjustments - 补录申请列表（按状态筛选 + 分页）
 *
 * 审核操作见 [id]/review 路由。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";
import { SPENT_CHANNEL_LABELS, SPENT_STATUS_LABELS } from "@/lib/spent-adjustments";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
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

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-adjust:read");
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

    const [applications, total, statusCounts] = await Promise.all([
      prisma.spentAdjustmentApplication.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          channel: true,
          orderNo: true,
          amountClaimed: true,
          purchasedAt: true,
          images: true,
          note: true,
          status: true,
          reviewAmount: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
          user: { select: { id: true, phone: true, nickname: true, membershipLevel: true } },
        },
      }),
      prisma.spentAdjustmentApplication.count({ where }),
      prisma.spentAdjustmentApplication.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const row of statusCounts) {
      counts[row.status] = row._count;
    }

    return NextResponse.json({
      success: true,
      data: {
        applications: applications.map((a) => ({
          ...a,
          channelLabel: SPENT_CHANNEL_LABELS[a.channel],
          statusLabel: SPENT_STATUS_LABELS[a.status],
          user: {
            id: a.user.id,
            phone: maskPhone(a.user.phone),
            nickname: a.user.nickname,
            membershipLevel: a.user.membershipLevel,
          },
          purchasedAt: a.purchasedAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          reviewedAt: a.reviewedAt?.toISOString() ?? null,
        })),
        counts,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentAdjustment] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

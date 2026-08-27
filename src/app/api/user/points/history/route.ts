/**
 * 积分变动历史 API
 * GET /api/user/points/history - 获取积分变动记录列表
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

const PAGE_SIZE = 20;

const POINT_TYPE_LABELS: Record<string, string> = {
  ORDER_REWARD: "消费奖励",
  ORDER_REWARD_REVERSAL: "退款扣回",
  BIRTHDAY_GIFT: "生日礼赠",
  ADMIN_ADJUST: "管理员调整",
  REDEEM: "积分兑换",
  LEVEL_UP_BONUS: "升级奖励",
  // 外部商城同步入账（2026-08 起积分由商城签名接口同步），补标签以正常展示与过滤；
  // 以上旧标签保留，兼容历史数据
  EXTERNAL_SYNC: "商城同步",
};

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (request: NextRequest, payload) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const type = searchParams.get("type");

    const where: Record<string, unknown> = { userId: payload.id };
    if (type && POINT_TYPE_LABELS[type]) {
      where.type = type;
    }

    const [transactions, total] = await Promise.all([
      prisma.pointTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          points: true,
          type: true,
          reference: true,
          note: true,
          createdAt: true,
        },
      }),
      prisma.pointTransaction.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        transactions: transactions.map((t) => ({
          ...t,
          typeLabel: POINT_TYPE_LABELS[t.type] ?? t.type,
          createdAt: t.createdAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          total,
          totalPages: Math.ceil(total / PAGE_SIZE),
        },
      },
    });
  } catch (error) {
    apiConsole.error("[GetPointsHistory] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

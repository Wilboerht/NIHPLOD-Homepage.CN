/**
 * 用户积分 API
 * GET /api/user/points - 查询积分余额（含物化：过期/释放）与最近流水
 *
 * 积分体系（2026-09 重新上线）：消费 1 元 = 1 分（银卡及以上），
 * 稳定期 7 天冻结，6 个月过期，退款冲正可负；兑礼入口在商城侧。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { getPointBalanceView } from "@/lib/points-ledger";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const data = await prisma.$transaction(async (tx) => {
      const balance = await getPointBalanceView(tx, payload.id);
      const recent = await tx.pointLedger.findMany({
        where: { userId: payload.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          amount: true,
          note: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      return {
        ...balance,
        nextReleaseAt: balance.nextReleaseAt?.toISOString() ?? null,
        recent: recent.map((r) => ({
          id: r.id,
          type: r.type,
          amount: r.amount,
          note: r.note,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[UserPoints] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

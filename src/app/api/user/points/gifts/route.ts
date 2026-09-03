/**
 * 用户积分礼品 API
 * GET /api/user/points/gifts - 上架礼品列表（含按当前等级折算的所需积分）+ 我的兑换记录
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { listActiveGifts, giftCostForUser } from "@/lib/point-gifts";
import { getPointBalanceView } from "@/lib/points-ledger";
import { POINT_REDEEM_RATES } from "@/lib/membership";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const data = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: payload.id },
        select: { membershipLevel: true },
      });
      const level = user?.membershipLevel ?? "REGULAR";

      const [gifts, balance, redemptions] = await Promise.all([
        listActiveGifts(),
        getPointBalanceView(tx, payload.id),
        tx.pointRedemption.findMany({
          where: { userId: payload.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            giftName: true,
            valueYuan: true,
            points: true,
            status: true,
            createdAt: true,
          },
        }),
      ]);

      return {
        membershipLevel: level,
        redeemRate: POINT_REDEEM_RATES[level],
        available: balance.available,
        frozen: balance.frozen,
        gifts: gifts.map((g) => {
          const cost = giftCostForUser(g.valueYuan, level);
          return {
            id: g.id,
            name: g.name,
            description: g.description,
            image: g.image,
            valueYuan: g.valueYuan,
            cost, // 实际所需积分（普通档为 null）
            affordable: cost !== null && cost <= balance.available,
          };
        }),
        redemptions: redemptions.map((r) => ({
          id: r.id,
          giftName: r.giftName,
          valueYuan: r.valueYuan,
          points: r.points,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[UserPointGifts] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

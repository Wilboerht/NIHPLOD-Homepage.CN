/**
 * 积分礼品兑换服务模块
 *
 * 官网维护礼品目录（PointGift），用户面板展示与兑换，管理端履约（PointRedemption）。
 * 实际扣分 = ⌊礼品市场价值 ÷ 当前兑礼率⌋（普通档不参与积分，不可兑换）。
 * 幂等：requestId 由客户端生成（每次确认弹窗一个），reference = redeem:{userId}:{requestId}，
 * PointLedger 与 PointRedemption 双重唯一约束防重复扣分/重复记录。
 */
import { prisma } from "@/lib/prisma";
import type { MembershipLevel } from "@/generated/prisma/client";
import { POINT_REDEEM_RATES } from "@/lib/membership";
import { redeemPoints } from "@/lib/points-ledger";

/** 按兑礼率折算用户实际扣分（普通档返回 null = 不参与） */
export function giftCostForUser(valueYuan: number, level: MembershipLevel): number | null {
  const rate = POINT_REDEEM_RATES[level];
  if (!rate) return null;
  return Math.max(1, Math.floor(valueYuan / rate));
}

/** 上架礼品列表（展示排序） */
export async function listActiveGifts() {
  return prisma.pointGift.findMany({
    where: { active: true },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  });
}

export type RedeemGiftResult =
  | { ok: true; duplicated: boolean; points: number; available: number; redemptionId: string }
  | {
      ok: false;
      code: "GIFT_NOT_FOUND" | "GIFT_INACTIVE" | "NOT_ELIGIBLE" | "INSUFFICIENT" | "INVALID_REQUEST";
      message: string;
    };

/**
 * 兑换礼品（单事务：幂等检查 → 礼品校验 → 折算 → 扣分 → 生成兑换记录）
 * 同一 requestId 重复调用直接返回首次结果（duplicated: true），不重复扣分。
 */
export async function redeemGiftForUser(params: {
  userId: string;
  giftId: string;
  requestId: string;
  level: MembershipLevel;
}): Promise<RedeemGiftResult> {
  const { userId, giftId, requestId, level } = params;
  if (!requestId || requestId.length > 64) {
    return { ok: false, code: "INVALID_REQUEST", message: "请求参数错误" };
  }
  const reference = `redeem:${userId}:${requestId}`;

  return prisma.$transaction(async (tx) => {
    // 幂等：同一请求单只产生一条兑换记录
    const existing = await tx.pointRedemption.findUnique({
      where: { userId_reference: { userId, reference } },
    });
    if (existing) {
      return { ok: true, duplicated: true, points: existing.points, available: 0, redemptionId: existing.id };
    }

    const gift = await tx.pointGift.findUnique({ where: { id: giftId } });
    if (!gift) {
      return { ok: false, code: "GIFT_NOT_FOUND", message: "礼品不存在" };
    }
    if (!gift.active) {
      return { ok: false, code: "GIFT_INACTIVE", message: "礼品已下架，请选择其它礼品" };
    }

    const points = giftCostForUser(gift.valueYuan, level);
    if (points === null) {
      return { ok: false, code: "NOT_ELIGIBLE", message: "银卡及以上会员可参与积分兑换" };
    }

    const result = await redeemPoints(tx, {
      userId,
      amount: points,
      reference,
      note: `兑换礼品：${gift.name}`,
    });
    if (!result.ok) {
      if (result.code === "DUPLICATE") {
        // 扣分流水已存在但兑换记录缺失（极端并发窗口）：补建记录，不重复扣分
        const redemption = await tx.pointRedemption.create({
          data: {
            userId,
            giftId,
            giftName: gift.name,
            valueYuan: gift.valueYuan,
            points,
            reference,
          },
        });
        return { ok: true, duplicated: true, points, available: result.available, redemptionId: redemption.id };
      }
      return { ok: false, code: result.code, message: "可用积分不足" };
    }

    const redemption = await tx.pointRedemption.create({
      data: {
        userId,
        giftId,
        giftName: gift.name,
        valueYuan: gift.valueYuan,
        points,
        reference,
      },
    });

    return {
      ok: true,
      duplicated: false,
      points,
      available: result.available,
      redemptionId: redemption.id,
    };
  });
}

/** 管理端：履约（PENDING → FULFILLED，CAS 抢占防并发重复履约） */
export async function fulfillRedemption(params: {
  redemptionId: string;
  adminId: string;
}): Promise<{ ok: boolean; code?: "NOT_FOUND" | "ALREADY_PROCESSED" }> {
  const { redemptionId } = params;
  const redemption = await prisma.pointRedemption.findUnique({
    where: { id: redemptionId },
    select: { id: true, status: true },
  });
  if (!redemption) return { ok: false, code: "NOT_FOUND" };
  if (redemption.status !== "PENDING") return { ok: false, code: "ALREADY_PROCESSED" };

  const claimed = await prisma.pointRedemption.updateMany({
    where: { id: redemptionId, status: "PENDING" },
    data: { status: "FULFILLED", fulfilledAt: new Date() },
  });
  return { ok: claimed.count > 0 };
}

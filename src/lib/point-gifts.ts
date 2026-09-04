/**
 * 积分兑换服务模块（兑换产品复用产品库）
 *
 * 产品库中 pointRedeemable=true 且 published=true 的产品出现在用户面板「兑换好礼」板块。
 * 实际扣分 = ⌊产品参考价格 ÷ 当前兑礼率⌋（普通档不开放兑礼，不可兑换）。
 * 幂等：requestId 由客户端生成（每次确认弹窗一个），reference = redeem:{userId}:{requestId}，
 * PointLedger 与 PointRedemption 双重唯一约束防重复扣分/重复记录。
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { MembershipLevel } from "@/generated/prisma/client";
import { POINT_REDEEM_RATES } from "@/lib/membership";
import { redeemPoints } from "@/lib/points-ledger";

/** 可兑换产品（产品库标记 + 已发布），按产品排序 */
export async function listRedeemableProducts() {
  return prisma.product.findMany({
    where: { pointRedeemable: true, published: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      images: {
        take: 1,
        orderBy: { order: "asc" },
        select: { url: true },
      },
    },
  });
}

/** 按兑礼率折算用户实际扣分（普通档返回 null = 不可兑礼） */
export function giftCostForUser(priceYuan: Prisma.Decimal, level: MembershipLevel): number | null {
  const rate = POINT_REDEEM_RATES[level];
  if (!rate) return null;
  return Math.max(1, Math.floor(Number(priceYuan) / rate));
}

export type RedeemGiftResult =
  | { ok: true; duplicated: boolean; points: number; available: number; redemptionId: string }
  | {
      ok: false;
      code:
        | "PRODUCT_NOT_FOUND"
        | "PRODUCT_NOT_REDEEMABLE"
        | "NOT_ELIGIBLE"
        | "INSUFFICIENT"
        | "INVALID_REQUEST";
      message: string;
    };

/**
 * 兑换产品（单事务：幂等检查 → 产品校验 → 折算 → 扣分 → 生成兑换记录）
 * 同一 requestId 重复调用直接返回首次结果（duplicated: true），不重复扣分。
 */
export async function redeemGiftForUser(params: {
  userId: string;
  productId: string;
  requestId: string;
  level: MembershipLevel;
}): Promise<RedeemGiftResult> {
  const { userId, productId, requestId, level } = params;
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
      return {
        ok: true,
        duplicated: true,
        points: existing.points,
        available: 0,
        redemptionId: existing.id,
      };
    }

    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, price: true, pointRedeemable: true, published: true },
    });
    if (!product) {
      return { ok: false, code: "PRODUCT_NOT_FOUND", message: "产品不存在" };
    }
    if (!product.pointRedeemable || !product.published) {
      return { ok: false, code: "PRODUCT_NOT_REDEEMABLE", message: "该产品暂不支持积分兑换" };
    }

    const points = giftCostForUser(product.price, level);
    if (points === null) {
      return { ok: false, code: "NOT_ELIGIBLE", message: "银卡及以上会员可参与积分兑换" };
    }

    const result = await redeemPoints(tx, {
      userId,
      amount: points,
      reference,
      note: `兑换产品：${product.name}`,
    });
    if (!result.ok) {
      if (result.code === "DUPLICATE") {
        // 扣分流水已存在但兑换记录缺失（极端并发窗口）：补建记录，不重复扣分
        const redemption = await tx.pointRedemption.create({
          data: {
            userId,
            productId,
            productName: product.name,
            priceYuan: product.price,
            points,
            reference,
          },
        });
        return {
          ok: true,
          duplicated: true,
          points,
          available: result.available,
          redemptionId: redemption.id,
        };
      }
      return { ok: false, code: result.code, message: "可用积分不足" };
    }

    const redemption = await tx.pointRedemption.create({
      data: {
        userId,
        productId,
        productName: product.name,
        priceYuan: product.price,
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

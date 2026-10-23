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
import { adjustPoints, redeemPoints, withPointTxRetry } from "@/lib/points-ledger";

/** 可兑换产品（产品库标记 + 已发布），按产品排序；字段供列表卡片与产品详情抽屉共用 */
export async function listRedeemableProducts() {
  return prisma.product.findMany({
    where: { pointRedeemable: true, published: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
      description: true,
      price: true,
      capacity: true,
      redeemStock: true,
      origin: true,
      ingredients: true,
      usage: true,
      benefits: true,
      images: {
        orderBy: { order: "asc" },
        select: { url: true, alt: true },
      },
      purchaseLinks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          platform: true,
          platformKey: true,
          url: true,
          miniProgramShortLink: true,
          miniProgramPath: true,
        },
      },
      category: { select: { name: true } },
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
        | "ADDRESS_NOT_FOUND"
        | "OUT_OF_STOCK"
        | "INSUFFICIENT"
        | "INVALID_REQUEST"
        | "PRICE_CHANGED";
      message: string;
      /** PRICE_CHANGED 时返回服务端当前折算分，供调用方刷新后再确认 */
      currentPoints?: number;
    };

type RedeemErrorCode = Extract<RedeemGiftResult, { ok: false }>["code"];

/**
 * 事务内回滚信号：mutation 之后才发现的失败必须抛错回滚（Prisma 事务回调正常返回即提交），
 * 否则已执行的扣减会被误提交（例：库存已扣但扣分 CAS 失败）。
 */
class RedeemRollback extends Error {
  readonly code: RedeemErrorCode;

  constructor(code: RedeemErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 兑换产品（单事务：幂等检查 → 产品校验 → 等级重读 → 地址校验 → 余额预检 → 库存扣减 → 扣分 → 生成兑换记录）
 * 同一 requestId 重复调用直接返回首次结果（duplicated: true），不重复扣分。
 * 会员等级在事务内重读（不接受外部传入的等级快照，防 TOCTOU 等级降档套利）。
 * redeemStock 非 null 时以条件更新扣库存（CAS），命中 0 行即库存不足，并发不超卖。
 * 收货地址取快照入库（履约寄送；事后修改地址簿不影响历史订单）。
 */
export async function redeemGiftForUser(params: {
  userId: string;
  productId: string;
  requestId: string;
  addressId: string;
  /** 客户端确认弹窗展示的积分；与实际重新折算不一致时拒绝，防止静默多扣/少扣 */
  expectedPoints?: number;
  /** OAuth 来源客户端（会话直兑为空），用于责任追溯 */
  clientId?: string | null;
}): Promise<RedeemGiftResult> {
  const { userId, productId, requestId, addressId, expectedPoints, clientId } = params;
  if (!requestId || requestId.length > 64) {
    return { ok: false, code: "INVALID_REQUEST", message: "请求参数错误" };
  }
  const reference = `redeem:${userId}:${requestId}`;

  try {
    return await withPointTxRetry(() => prisma.$transaction(async (tx) => {
      // 幂等：同一请求单只产生一条兑换记录
      const existing = await tx.pointRedemption.findUnique({
        where: { userId_reference: { userId, reference } },
      });
      if (existing) {
        const balance = await tx.pointBalance.findUnique({
          where: { userId },
          select: { available: true },
        });
        return {
          ok: true,
          duplicated: true,
          points: existing.points,
          available: balance?.available ?? 0,
          redemptionId: existing.id,
        };
      }

      const product = await tx.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          price: true,
          pointRedeemable: true,
          published: true,
          redeemStock: true,
        },
      });
      if (!product) {
        return { ok: false, code: "PRODUCT_NOT_FOUND", message: "产品不存在" };
      }
      if (!product.pointRedeemable || !product.published) {
        return { ok: false, code: "PRODUCT_NOT_REDEEMABLE", message: "该产品暂不支持积分兑换" };
      }

      // 等级以事务内读取为准（外部快照可能已过期：消费升级/退款降档的 TOCTOU 窗口）
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { membershipLevel: true },
      });
      const level: MembershipLevel = user?.membershipLevel ?? "REGULAR";

      const points = giftCostForUser(product.price, level);
      if (points === null) {
        return { ok: false, code: "NOT_ELIGIBLE", message: "银卡及以上会员可参与积分兑换" };
      }

      // 报价一致性：价格/会员等级可能在用户打开确认页后变化。
      // 不静默按新值扣分，而是让用户重新确认（调用方刷新礼品列表）。
      if (expectedPoints !== undefined && expectedPoints !== points) {
        return {
          ok: false,
          code: "PRICE_CHANGED",
          message: `礼品所需积分已变化（当前 ${points} 积分），请刷新后重新确认`,
          currentPoints: points,
        };
      }

      // 收货地址校验（扣分前拦截，地址必须属于当前用户）
      const address = await tx.userAddress.findUnique({
        where: { id: addressId },
        select: { userId: true, recipient: true, phone: true, region: true, detail: true },
      });
      if (!address || address.userId !== userId) {
        return { ok: false, code: "ADDRESS_NOT_FOUND", message: "收货地址不存在，请重新选择" };
      }
      const fullAddress = `${address.region} ${address.detail}`;

      // 余额预检（先于库存扣减）：余额不足是常态错误，提前拦截避免白扣限量库存
      const balance = await tx.pointBalance.findUnique({
        where: { userId },
        select: { available: true },
      });
      if (!balance || balance.available < points) {
        return { ok: false, code: "INSUFFICIENT", message: "可用积分不足" };
      }

      // 限量库存：条件扣减（CAS），命中 0 行即库存不足（未发生变更，可直接返回）；null = 不限量
      if (product.redeemStock !== null) {
        const deducted = await tx.product.updateMany({
          where: { id: productId, redeemStock: { gte: 1 } },
          data: { redeemStock: { decrement: 1 } },
        });
        if (deducted.count === 0) {
          return { ok: false, code: "OUT_OF_STOCK", message: "该礼品已兑完" };
        }
      }

      const result = await redeemPoints(tx, {
        userId,
        amount: points,
        reference,
        note: `兑换产品：${product.name}`,
      });
      if (!result.ok) {
        // 预检通过但扣分 CAS 失败（并发扣光）：必须抛错回滚已扣库存
        throw new RedeemRollback("INSUFFICIENT", "可用积分不足");
      }

      const redemption = await tx.pointRedemption.create({
        data: {
          userId,
          productId,
          productName: product.name,
          priceYuan: product.price,
          points,
          level,
          redeemRate: POINT_REDEEM_RATES[level],
          clientId: clientId ?? null,
          reference,
          recipient: address.recipient,
          phone: address.phone,
          address: fullAddress,
        },
      });

      return {
        ok: true,
        duplicated: false,
        points,
        available: result.available,
        redemptionId: redemption.id,
      };
    }));
  } catch (error) {
    if (error instanceof RedeemRollback) {
      return { ok: false, code: error.code, message: error.message };
    }
    // 并发同一 requestId：两条请求都通过幂等检查，后者撞上 userId_reference 唯一约束。
    // 此时后者事务整体回滚（含库存/积分的任何扣减），返回与首次一致的幂等结果。
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.pointRedemption.findUnique({
        where: { userId_reference: { userId, reference } },
        select: { id: true, points: true },
      });
      if (existing) {
        const balance = await prisma.pointBalance.findUnique({
          where: { userId },
          select: { available: true },
        });
        return {
          ok: true,
          duplicated: true,
          points: existing.points,
          available: balance?.available ?? 0,
          redemptionId: existing.id,
        };
      }
    }
    throw error;
  }
}

/** 管理端：履约（PENDING → FULFILLED，CAS 抢占防并发重复履约；可选录入运单号） */
export async function fulfillRedemption(params: {
  redemptionId: string;
  adminId: string;
  waybillNo?: string;
}): Promise<{
  ok: boolean;
  code?: "NOT_FOUND" | "ALREADY_PROCESSED" | "NEGATIVE_BALANCE";
  available?: number;
}> {
  const { redemptionId, waybillNo } = params;

  return withPointTxRetry(() =>
    prisma.$transaction(async (tx) => {
      const redemption = await tx.pointRedemption.findUnique({
        where: { id: redemptionId },
        select: { id: true, status: true, userId: true },
      });
    if (!redemption) return { ok: false, code: "NOT_FOUND" as const };
    if (redemption.status !== "PENDING") {
      return { ok: false, code: "ALREADY_PROCESSED" as const };
    }

    // 履约前风控：退款/消费额下降可把用户积分冲成负数（超兑债务）。
    // 负积分时禁止直接发货，需管理员先人工调整/取消兑换，避免“先发货后追债”。
    // 锁余额行，避免与并发退款检查后写入形成竞态。
    await tx.$queryRaw`SELECT "id" FROM "PointBalance" WHERE "userId" = ${redemption.userId} FOR UPDATE`;
    const balance = await tx.pointBalance.findUnique({
      where: { userId: redemption.userId },
      select: { available: true },
    });
    const available = balance?.available ?? 0;
    if (available < 0) {
      return { ok: false, code: "NEGATIVE_BALANCE" as const, available };
    }

    const claimed = await tx.pointRedemption.updateMany({
      where: { id: redemptionId, status: "PENDING" },
      data: {
        status: "FULFILLED",
        fulfilledAt: new Date(),
        ...(waybillNo ? { waybillNo, carrier: "SF" } : {}),
      },
    });
      return claimed.count > 0
        ? { ok: true as const }
        : { ok: false, code: "ALREADY_PROCESSED" as const };
    })
  );
}

/**
 * 取消 PENDING 兑换时归还限量库存。
 * 仅当商品仍存在且 redeemStock 非 null（限量）时 +1；不限量商品保持 null。
 */
async function releaseRedemptionStock(
  tx: Prisma.TransactionClient,
  productId: string | null
): Promise<void> {
  if (!productId) return;
  await tx.product.updateMany({
    where: { id: productId, redeemStock: { not: null } },
    data: { redeemStock: { increment: 1 } },
  });
}

/**
 * 管理端：取消兑换并退还积分（PENDING → CANCELLED，CAS 抢占防并发重复取消）。
 * 退款走正向 ADJUST 流水（reference=cancel:{redemptionId} 幂等，6 个月有效期），
 * 已消耗的 FIFO 流水不回滚，保证账本余额与剩余量一致。
 * 限量库存同时 +1，避免“兑换-取消”反复操作耗尽库存。
 */
export async function cancelRedemption(params: {
  redemptionId: string;
  note?: string;
}): Promise<{ ok: boolean; code?: "NOT_FOUND" | "ALREADY_PROCESSED"; points?: number }> {
  const { redemptionId, note } = params;

  return withPointTxRetry(() =>
    prisma.$transaction(async (tx) => {
      const redemption = await tx.pointRedemption.findUnique({
        where: { id: redemptionId },
        select: {
          id: true,
          userId: true,
          points: true,
          status: true,
          productName: true,
          productId: true,
        },
      });
    if (!redemption) return { ok: false, code: "NOT_FOUND" };
    if (redemption.status !== "PENDING") return { ok: false, code: "ALREADY_PROCESSED" };

    const cancelNote = note?.trim() || null;
    const claimed = await tx.pointRedemption.updateMany({
      where: { id: redemptionId, status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelNote },
    });
    if (claimed.count === 0) return { ok: false, code: "ALREADY_PROCESSED" };

    await releaseRedemptionStock(tx, redemption.productId);

    await adjustPoints(tx, {
      userId: redemption.userId,
      amount: redemption.points,
      reference: `cancel:${redemptionId}`,
      note: cancelNote || `兑换取消退还：${redemption.productName}`,
    });

      return { ok: true, points: redemption.points };
    })
  );
}

/** 管理端：补录/更新运单号（已履约订单；传空字符串清除） */
export async function updateRedemptionWaybill(params: {
  redemptionId: string;
  waybillNo: string | null;
}): Promise<{ ok: boolean; code?: "NOT_FOUND" | "INVALID_STATUS" }> {
  const { redemptionId, waybillNo } = params;
  const redemption = await prisma.pointRedemption.findUnique({
    where: { id: redemptionId },
    select: { id: true, status: true },
  });
  if (!redemption) return { ok: false, code: "NOT_FOUND" };
  // 运单号只对已履约订单有意义；待履约/已取消单不应写入物流信息
  if (redemption.status !== "FULFILLED") return { ok: false, code: "INVALID_STATUS" };

  await prisma.pointRedemption.update({
    where: { id: redemptionId },
    data: waybillNo ? { waybillNo, carrier: "SF" } : { waybillNo: null, carrier: null },
  });
  return { ok: true };
}

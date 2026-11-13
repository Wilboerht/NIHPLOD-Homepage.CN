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
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { enqueueNotification } from "@/lib/notification-outbox";
import { recordRedemptionEvent } from "@/lib/redemption-state-machine";
import { getRedemptionFulfillableAt } from "@/lib/redemption-protection";

/** 可兑换产品（产品库标记 + 已发布），按产品排序；字段供列表卡片与产品详情抽屉共用 */
export async function listRedeemableProducts() {
  return prisma.product.findMany({
    where: { pointRedeemable: true, published: true, category: { visible: true } },
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
      redeemLimitPerUser: true,
      redeemLimitWindowDays: true,
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
        | "ACCOUNT_DISABLED"
        | "NOT_ELIGIBLE"
        | "ADDRESS_NOT_FOUND"
        | "OUT_OF_STOCK"
        | "INSUFFICIENT"
        | "REFERENCE_CONFLICT"
        | "INVALID_REQUEST"
        | "PRICE_CHANGED"
        | "REDEMPTION_LIMIT_REACHED";
      message: string;
      /** PRICE_CHANGED 时返回服务端当前折算分，供调用方刷新后再确认 */
      currentPoints?: number;
      limit?: number;
      windowDays?: number | null;
      used?: number;
      remaining?: number;
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
    return await withPointTxRetry(() =>
      prisma.$transaction(async (tx) => {
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

        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        // 锁定产品行，避免确认价格后管理员并发改价导致按旧价扣分
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: {
            id: true,
            name: true,
            price: true,
            pointRedeemable: true,
            published: true,
            redeemStock: true,
            redeemLimitPerUser: true,
            redeemLimitWindowDays: true,
            category: { select: { visible: true } },
          },
        });
        if (!product) {
          return { ok: false, code: "PRODUCT_NOT_FOUND", message: "产品不存在" };
        }
        if (!product.pointRedeemable || !product.published || product.category?.visible === false) {
          return { ok: false, code: "PRODUCT_NOT_REDEEMABLE", message: "该产品暂不支持积分兑换" };
        }

        // 等级以事务内读取为准（外部快照可能已过期：消费升级/退款降档的 TOCTOU 窗口）
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { membershipLevel: true, status: true },
        });
        if (user?.status !== "ACTIVE") {
          return { ok: false, code: "ACCOUNT_DISABLED", message: "账户不可用" };
        }
        const level: MembershipLevel = user.membershipLevel;

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

        if (product.redeemLimitPerUser !== null) {
          const windowStart =
            product.redeemLimitWindowDays !== null
              ? new Date(Date.now() - product.redeemLimitWindowDays * 24 * 60 * 60 * 1000)
              : undefined;
          const used = await tx.pointRedemption.count({
            where: {
              userId,
              productId,
              status: { notIn: ["CANCELLED", "REFUNDED"] },
              ...(windowStart ? { createdAt: { gte: windowStart } } : {}),
            },
          });
          if (used >= product.redeemLimitPerUser) {
            return {
              ok: false,
              code: "REDEMPTION_LIMIT_REACHED",
              message:
                product.redeemLimitWindowDays !== null
                  ? `该礼品每 ${product.redeemLimitWindowDays} 天最多兑换 ${product.redeemLimitPerUser} 件`
                  : `该礼品终身最多兑换 ${product.redeemLimitPerUser} 件`,
              limit: product.redeemLimitPerUser,
              windowDays: product.redeemLimitWindowDays,
              used,
              remaining: 0,
            };
          }
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
          // 预检通过但扣分 CAS 失败（并发扣光）或 reference 与其它端冲突：
          // 必须抛错回滚已扣库存。
          if (result.code === "REFERENCE_CONFLICT") {
            throw new RedeemRollback("REFERENCE_CONFLICT", "兑换请求号已被其他业务占用");
          }
          throw new RedeemRollback("INSUFFICIENT", "可用积分不足");
        }
        if (result.spent !== points) {
          // 幂等分支理论上已在上面 pointRedemption 查找中返回；走到这里说明
          // 命中了其它端/类型的积分流水，不能创建免费兑换单。
          throw new RedeemRollback("REFERENCE_CONFLICT", "兑换请求号已被其他业务占用");
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
            stockDeducted: product.redeemStock !== null,
            reference,
            recipient: address.recipient,
            phone: address.phone,
            address: fullAddress,
          },
        });
        await recordRedemptionEvent(tx, {
          redemptionId: redemption.id,
          fromStatus: null,
          toStatus: "PENDING",
          actorType: "USER",
          actorId: userId,
          reasonCode: "redeem_created",
          metadata: { points, clientId: clientId ?? null },
          idempotencyKey: `redemption-created:${redemption.id}`,
        });

        return {
          ok: true,
          duplicated: false,
          points,
          available: result.available,
          redemptionId: redemption.id,
        };
      })
    );
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
  code?:
    | "NOT_FOUND"
    | "ALREADY_PROCESSED"
    | "NEGATIVE_BALANCE"
    | "USER_INACTIVE"
    | "FULFILL_PROTECTION_ACTIVE";
  available?: number;
  fulfillableAt?: string;
}> {
  const { redemptionId, adminId, waybillNo } = params;

  return withPointTxRetry(() =>
    prisma.$transaction(async (tx) => {
      const redemption = await tx.pointRedemption.findUnique({
        where: { id: redemptionId },
        select: {
          id: true,
          status: true,
          userId: true,
          productName: true,
          createdAt: true,
          user: { select: { status: true, phone: true } },
        },
      });
      if (!redemption) return { ok: false, code: "NOT_FOUND" as const };
      if (redemption.status !== "PENDING") {
        return { ok: false, code: "ALREADY_PROCESSED" as const };
      }
      if (redemption.user.status !== "ACTIVE") {
        return { ok: false, code: "USER_INACTIVE" as const };
      }
      const fulfillableAt = getRedemptionFulfillableAt(redemption.createdAt);
      if (fulfillableAt.getTime() > Date.now()) {
        return {
          ok: false,
          code: "FULFILL_PROTECTION_ACTIVE" as const,
          fulfillableAt: fulfillableAt.toISOString(),
        };
      }

      // 履约前风控：退款/消费额下降可把用户积分冲成负数（超兑债务）。
      // 负积分时禁止直接发货，需管理员先人工调整/取消兑换，避免“先发货后追债”。
      // 锁余额行，避免与并发退款检查后写入形成竞态。
      await tx.$queryRaw`SELECT "id" FROM "PointBalance" WHERE "userId" = ${redemption.userId} FOR UPDATE`;
      const balance = await tx.pointBalance.findUnique({
        where: { userId: redemption.userId },
        select: { available: true },
      });
      if (!balance) {
        return { ok: false, code: "NEGATIVE_BALANCE" as const, available: 0 };
      }
      const available = balance.available;
      if (available < 0) {
        return { ok: false, code: "NEGATIVE_BALANCE" as const, available };
      }

      const fulfilledAt = new Date();
      const claimed = await tx.pointRedemption.updateMany({
        where: { id: redemptionId, status: "PENDING" },
        data: {
          status: "FULFILLED",
          fulfilledAt,
          ...(waybillNo ? { waybillNo, carrier: "SF" } : {}),
        },
      });
      if (claimed.count === 0) return { ok: false, code: "ALREADY_PROCESSED" as const };

      await recordRedemptionEvent(tx, {
        redemptionId,
        fromStatus: "PENDING",
        toStatus: "FULFILLED",
        actorType: "ADMIN",
        actorId: adminId,
        reasonCode: "fulfilled",
        metadata: { waybillNo: waybillNo ?? null },
        idempotencyKey: `redemption-fulfilled:${redemptionId}`,
      });

      const payload = {
        productName: redemption.productName,
        waybillNo: waybillNo ?? "",
        statusLabel: "已发货",
        fulfilledAt: fulfilledAt.toISOString(),
      };
      await Promise.all([
        enqueueNotification(
          {
            idempotencyKey: `redemption-shipped:${redemptionId}:mp`,
            channel: "MINIPROGRAM",
            eventType: "redemption_shipped",
            templateKey: "redemption_shipped",
            userId: redemption.userId,
            recipient: { userId: redemption.userId },
            payload,
            aggregateType: "point_redemption",
            aggregateId: redemptionId,
          },
          tx
        ),
        enqueueNotification(
          {
            idempotencyKey: `redemption-shipped:${redemptionId}:sms`,
            channel: "SMS",
            eventType: "redemption_status",
            templateKey: "redemption_status",
            userId: redemption.userId,
            recipient: { phone: redemption.user.phone },
            payload,
            aggregateType: "point_redemption",
            aggregateId: redemptionId,
          },
          tx
        ),
      ]);
      return { ok: true as const };
    })
  );
}

/**
 * 仅归还本单实际预留过的库存，商品后续切换库存模式不影响历史订单。
 */
async function releaseRedemptionStock(
  tx: Prisma.TransactionClient,
  productId: string | null,
  stockDeducted: boolean
): Promise<void> {
  if (!productId || !stockDeducted) return;
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
  actorType?: "ADMIN" | "SYSTEM";
  actorId?: string;
}): Promise<{ ok: boolean; code?: "NOT_FOUND" | "ALREADY_PROCESSED"; points?: number }> {
  const { redemptionId, note, actorType = "SYSTEM", actorId } = params;

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
          stockDeducted: true,
          user: { select: { status: true, phone: true } },
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

      await releaseRedemptionStock(tx, redemption.productId, redemption.stockDeducted);
      await recordRedemptionEvent(tx, {
        redemptionId,
        fromStatus: "PENDING",
        toStatus: "CANCELLED",
        actorType,
        actorId,
        reasonCode: actorType === "SYSTEM" ? "pending_timeout" : "admin_cancel",
        reasonText: cancelNote,
        metadata: { points: redemption.points },
        idempotencyKey: `redemption-cancelled:${redemptionId}`,
      });

      // 已注销用户不再写余额/流水，只完成取消与库存归还，避免注销后账户仍可变动。
      if (redemption.user.status !== "DELETED") {
        await adjustPoints(tx, {
          userId: redemption.userId,
          amount: redemption.points,
          reference: `cancel:${redemptionId}`,
          note: cancelNote || `兑换取消退还：${redemption.productName}`,
        });
        const payload = {
          productName: redemption.productName,
          statusLabel: "已取消",
          points: redemption.points,
          note: cancelNote,
        };
        await Promise.all([
          enqueueNotification(
            {
              idempotencyKey: `redemption-canceled:${redemptionId}:sms`,
              channel: "SMS",
              eventType: "redemption_status",
              templateKey: "redemption_status",
              userId: redemption.userId,
              recipient: { phone: redemption.user.phone },
              payload,
              aggregateType: "point_redemption",
              aggregateId: redemptionId,
            },
            tx
          ),
          enqueueNotification(
            {
              idempotencyKey: `redemption-canceled:${redemptionId}:mp`,
              channel: "MINIPROGRAM",
              eventType: "redemption_status",
              templateKey: "redemption_status",
              userId: redemption.userId,
              recipient: { userId: redemption.userId },
              payload,
              aggregateType: "point_redemption",
              aggregateId: redemptionId,
            },
            tx
          ),
        ]);
        return { ok: true, points: redemption.points };
      }
      return { ok: true, points: 0 };
    })
  );
}

/** 管理端：补录/更新运单号（已履约订单；传空字符串清除） */
export async function updateRedemptionWaybill(params: {
  redemptionId: string;
  adminId: string;
  waybillNo: string | null;
}): Promise<{ ok: boolean; code?: "NOT_FOUND" | "INVALID_STATUS" }> {
  const { redemptionId, adminId, waybillNo } = params;
  return prisma.$transaction(async (tx) => {
    const redemption = await tx.pointRedemption.findUnique({
      where: { id: redemptionId },
      select: { id: true, status: true, waybillNo: true },
    });
    if (!redemption) return { ok: false, code: "NOT_FOUND" as const };
    if (redemption.status !== "FULFILLED") return { ok: false, code: "INVALID_STATUS" as const };

    await tx.pointRedemption.update({
      where: { id: redemptionId },
      data: waybillNo ? { waybillNo, carrier: "SF" } : { waybillNo: null, carrier: null },
    });
    await recordRedemptionEvent(tx, {
      redemptionId,
      fromStatus: "FULFILLED",
      toStatus: "FULFILLED",
      actorType: "ADMIN",
      actorId: adminId,
      reasonCode: "waybill_updated",
      metadata: { before: redemption.waybillNo, after: waybillNo },
      idempotencyKey: `redemption-waybill:${redemptionId}:${Date.now()}`,
    });
    return { ok: true };
  });
}

/**
 * Cron 自动取消超时未履约的兑换，退还积分并释放限量库存。
 * 默认 30 天，可通过 POINT_REDEMPTION_PENDING_DAYS 调整；设为 0 可关闭。
 */
export async function expirePendingRedemptions(
  options: { days?: number; limit?: number } = {}
): Promise<{
  scanned: number;
  cancelled: number;
  skipped: number;
  failed: number;
  refundedPoints: number;
}> {
  const configuredDays = options.days ?? Number(process.env.POINT_REDEMPTION_PENDING_DAYS ?? "30");
  const days = Number.isFinite(configuredDays) ? configuredDays : 30;
  if (days <= 0) {
    return { scanned: 0, cancelled: 0, skipped: 0, failed: 0, refundedPoints: 0 };
  }
  const limit = Math.min(500, Math.max(1, options.limit ?? 200));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const pending = await prisma.pointRedemption.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true, userId: true, productName: true, points: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let cancelled = 0;
  let skipped = 0;
  let failed = 0;
  let refundedPoints = 0;
  for (const redemption of pending) {
    const auditId = await beginAuditLog({
      action: "point_redemption_auto_cancel",
      targetType: "point_redemption",
      targetId: redemption.id,
      userId: redemption.userId,
      actorType: "SYSTEM",
      authMethod: "cron",
      detail: {
        reason: "pending_timeout",
        days,
        productName: redemption.productName,
        points: redemption.points,
        createdAt: redemption.createdAt.toISOString(),
      },
    });
    if (!auditId) {
      failed += 1;
      continue;
    }

    try {
      const result = await cancelRedemption({
        redemptionId: redemption.id,
        note: `超时 ${days} 天未履约自动取消`,
      });
      if (result.ok) {
        cancelled += 1;
        refundedPoints += result.points ?? 0;
        await finishAuditLog(auditId, "SUCCESS", {
          refundedPoints: result.points ?? 0,
        });
      } else if (result.code === "ALREADY_PROCESSED") {
        skipped += 1;
        await finishAuditLog(auditId, "FAILURE", { code: result.code });
      } else {
        failed += 1;
        await finishAuditLog(auditId, "FAILURE", { code: result.code ?? "UNKNOWN" });
      }
    } catch (error) {
      failed += 1;
      apiConsole.error(`[PointRedemptionTimeout] 取消失败 id=${redemption.id}:`, error);
      await finishAuditLog(auditId, "FAILURE", { error: "EXCEPTION" });
    }
  }

  return { scanned: pending.length, cancelled, skipped, failed, refundedPoints };
}

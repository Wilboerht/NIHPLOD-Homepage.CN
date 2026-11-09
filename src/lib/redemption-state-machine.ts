/**
 * 积分兑换履约 / 售后状态机。
 *
 * 所有状态流转集中在此模块：
 * PENDING -> FULFILLED -> COMPLETED
 * FULFILLED/COMPLETED/REJECTED -> AFTER_SALES_REQUESTED -> APPROVED/REJECTED
 * APPROVED -> RETURNING -> RETURNED -> REFUNDED
 * APPROVED -> AFTER_SALES_CLOSED（超时未寄回）
 */
import { Prisma } from "@/generated/prisma/client";
import type { PointRedemptionStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { adjustPoints, withPointTxRetry } from "@/lib/points-ledger";
import { enqueueNotification } from "@/lib/notification-outbox";
import { apiConsole } from "@/lib/logger";

function envDays(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const AFTER_SALES_WINDOW_DAYS = envDays("REDEMPTION_AFTER_SALES_WINDOW_DAYS", 7);
const RETURN_WINDOW_DAYS = envDays("REDEMPTION_RETURN_WINDOW_DAYS", 7);
const AUTO_COMPLETE_DAYS = envDays("REDEMPTION_AUTO_COMPLETE_DAYS", 15);

export const ACTIVE_AFTER_SALES_STATUSES: PointRedemptionStatus[] = [
  "AFTER_SALES_REQUESTED",
  "AFTER_SALES_APPROVED",
  "RETURNING",
  "RETURNED",
];

type Tx = Prisma.TransactionClient;

export class RedemptionTransitionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function windowExpired(from: Date | null, days: number): boolean {
  if (!from) return true;
  return from.getTime() < daysAgo(days).getTime();
}

async function appendEvent(
  tx: Tx,
  input: {
    redemptionId: string;
    fromStatus: string | null;
    toStatus: string;
    actorType: "USER" | "ADMIN" | "SYSTEM";
    actorId?: string | null;
    reasonCode?: string | null;
    reasonText?: string | null;
    metadata?: Prisma.InputJsonValue;
    idempotencyKey: string;
  }
): Promise<void> {
  try {
    await tx.pointRedemptionEvent.create({
      data: {
        redemptionId: input.redemptionId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        reasonCode: input.reasonCode ?? null,
        reasonText: input.reasonText ?? null,
        metadata: input.metadata,
        idempotencyKey: input.idempotencyKey,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}

async function enqueueStatusNotification(
  tx: Tx,
  params: {
    redemptionId: string;
    userId: string;
    phone: string | null;
    productName: string;
    statusLabel: string;
    eventKey: string;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  const payload = {
    productName: params.productName,
    statusLabel: params.statusLabel,
    ...params.extra,
  };
  const jobs: Promise<string>[] = [
    enqueueNotification(
      {
        idempotencyKey: `${params.eventKey}:mp`,
        channel: "MINIPROGRAM",
        eventType: "redemption_status",
        templateKey: "redemption_status",
        userId: params.userId,
        recipient: { userId: params.userId },
        payload,
        aggregateType: "point_redemption",
        aggregateId: params.redemptionId,
      },
      tx
    ),
  ];
  if (params.phone) {
    jobs.push(
      enqueueNotification(
        {
          idempotencyKey: `${params.eventKey}:sms`,
          channel: "SMS",
          eventType: "redemption_status",
          templateKey: "redemption_status",
          userId: params.userId,
          recipient: { phone: params.phone },
          payload,
          aggregateType: "point_redemption",
          aggregateId: params.redemptionId,
        },
        tx
      )
    );
  }
  await Promise.all(jobs);
}

export async function confirmRedemption(params: {
  redemptionId: string;
  userId?: string;
  actorType?: "USER" | "ADMIN" | "SYSTEM";
  actorId?: string | null;
}): Promise<{ ok: true; status: "COMPLETED" } | { ok: false; code: string; message: string }> {
  const { redemptionId, userId, actorType = "USER", actorId } = params;
  try {
    return await withPointTxRetry(() =>
      prisma.$transaction(async (tx) => {
        const redemption = await tx.pointRedemption.findUnique({
          where: { id: redemptionId },
          select: {
            id: true,
            userId: true,
            status: true,
            productName: true,
            user: { select: { phone: true, status: true } },
          },
        });
        if (!redemption || (userId && redemption.userId !== userId)) {
          return { ok: false as const, code: "NOT_FOUND", message: "兑换记录不存在" };
        }
        if (redemption.status !== "FULFILLED") {
          return { ok: false as const, code: "INVALID_STATUS", message: "当前状态不能确认收货" };
        }
        if (redemption.user.status === "DELETED") {
          return { ok: false as const, code: "USER_DELETED", message: "账号已注销" };
        }

        const completedAt = new Date();
        const updated = await tx.pointRedemption.updateMany({
          where: { id: redemptionId, status: "FULFILLED" },
          data: { status: "COMPLETED", completedAt },
        });
        if (updated.count === 0) {
          return { ok: false as const, code: "ALREADY_PROCESSED", message: "兑换已处理" };
        }

        const eventKey = `redemption-completed:${redemptionId}`;
        await appendEvent(tx, {
          redemptionId,
          fromStatus: "FULFILLED",
          toStatus: "COMPLETED",
          actorType,
          actorId,
          idempotencyKey: eventKey,
          metadata: { completedAt: completedAt.toISOString() },
        });
        await enqueueStatusNotification(tx, {
          redemptionId,
          userId: redemption.userId,
          phone: redemption.user.phone,
          productName: redemption.productName,
          statusLabel: "已完成",
          eventKey,
        });
        return { ok: true as const, status: "COMPLETED" as const };
      })
    );
  } catch (error) {
    apiConsole.error("[RedemptionState] 确认收货失败:", error);
    return { ok: false, code: "INTERNAL_ERROR", message: "确认收货失败" };
  }
}

export async function autoCompleteRedemptions(
  options: { days?: number; limit?: number } = {}
): Promise<number> {
  const days = options.days ?? AUTO_COMPLETE_DAYS;
  const limit = Math.min(500, Math.max(1, options.limit ?? 200));
  const rows = await prisma.pointRedemption.findMany({
    where: {
      status: "FULFILLED",
      fulfilledAt: { lt: daysAgo(days) },
      user: { status: { not: "DELETED" } },
    },
    select: { id: true },
    take: limit,
    orderBy: { fulfilledAt: "asc" },
  });
  let completed = 0;
  for (const row of rows) {
    const result = await confirmRedemption({
      redemptionId: row.id,
      actorType: "SYSTEM",
    });
    if (result.ok) completed += 1;
  }
  return completed;
}

export async function requestAfterSales(params: {
  redemptionId: string;
  userId: string;
  requestId: string;
  reason: string;
  images?: string[];
}): Promise<
  { ok: true; status: "AFTER_SALES_REQUESTED" } | { ok: false; code: string; message: string }
> {
  const { redemptionId, userId, requestId, reason, images } = params;
  if (!requestId || requestId.length > 64) {
    return { ok: false, code: "INVALID_REQUEST", message: "请求参数错误" };
  }
  if (!reason.trim()) {
    return { ok: false, code: "REASON_REQUIRED", message: "请填写售后原因" };
  }
  try {
    return await withPointTxRetry(() =>
      prisma.$transaction(async (tx) => {
        const redemption = await tx.pointRedemption.findUnique({
          where: { id: redemptionId },
          select: {
            id: true,
            userId: true,
            status: true,
            productName: true,
            fulfilledAt: true,
            user: { select: { phone: true, status: true } },
          },
        });
        if (!redemption || redemption.userId !== userId) {
          return { ok: false as const, code: "NOT_FOUND", message: "兑换记录不存在" };
        }
        if (redemption.user.status !== "ACTIVE") {
          return { ok: false as const, code: "ACCOUNT_DISABLED", message: "账号不可用" };
        }
        const allowed: PointRedemptionStatus[] = ["FULFILLED", "COMPLETED", "AFTER_SALES_REJECTED"];
        if (!allowed.includes(redemption.status)) {
          if (ACTIVE_AFTER_SALES_STATUSES.includes(redemption.status)) {
            return { ok: false as const, code: "AFTER_SALES_ACTIVE", message: "已有进行中的售后" };
          }
          return { ok: false as const, code: "INVALID_STATUS", message: "当前状态不能申请售后" };
        }
        if (windowExpired(redemption.fulfilledAt, AFTER_SALES_WINDOW_DAYS)) {
          return {
            ok: false as const,
            code: "AFTER_SALES_WINDOW_EXPIRED",
            message: "已超过售后申请期限",
          };
        }

        const now = new Date();
        const eventKey = `after-sales-request:${redemptionId}:${requestId}`;
        const updated = await tx.pointRedemption.updateMany({
          where: { id: redemptionId, status: redemption.status },
          data: {
            status: "AFTER_SALES_REQUESTED",
            afterSalesRequestedAt: now,
            afterSalesReason: reason.trim(),
            afterSalesImages: images?.slice(0, 3) ?? [],
            afterSalesReviewedAt: null,
            afterSalesReviewedById: null,
            afterSalesReviewNote: null,
            afterSalesApprovedAt: null,
            afterSalesClosedAt: null,
            returnWaybillNo: null,
            returnCarrier: null,
            returnShippedAt: null,
            returnReceivedAt: null,
            inspectionNote: null,
            restockApproved: false,
            stockRestored: false,
            stockRestoredAt: null,
            refundedPoints: 0,
            refundedAt: null,
          },
        });
        if (updated.count === 0) {
          return {
            ok: false as const,
            code: "ALREADY_PROCESSED",
            message: "兑换状态已变化，请刷新",
          };
        }

        await appendEvent(tx, {
          redemptionId,
          fromStatus: redemption.status,
          toStatus: "AFTER_SALES_REQUESTED",
          actorType: "USER",
          actorId: userId,
          reasonCode: "user_request",
          reasonText: reason.trim(),
          metadata: { images: images?.slice(0, 3) ?? [] },
          idempotencyKey: eventKey,
        });
        await enqueueStatusNotification(tx, {
          redemptionId,
          userId,
          phone: redemption.user.phone,
          productName: redemption.productName,
          statusLabel: "售后申请已提交",
          eventKey,
        });
        return { ok: true as const, status: "AFTER_SALES_REQUESTED" as const };
      })
    );
  } catch (error) {
    apiConsole.error("[RedemptionState] 售后申请失败:", error);
    return { ok: false, code: "INTERNAL_ERROR", message: "售后申请失败" };
  }
}

export async function reviewAfterSales(params: {
  redemptionId: string;
  adminId: string;
  approve: boolean;
  note?: string;
}): Promise<
  | { ok: true; status: "AFTER_SALES_APPROVED" | "AFTER_SALES_REJECTED" }
  | { ok: false; code: string; message: string }
> {
  const { redemptionId, adminId, approve, note } = params;
  try {
    return await withPointTxRetry(() =>
      prisma.$transaction(async (tx) => {
        const redemption = await tx.pointRedemption.findUnique({
          where: { id: redemptionId },
          select: {
            id: true,
            userId: true,
            status: true,
            productName: true,
            afterSalesRequestedAt: true,
            user: { select: { phone: true } },
          },
        });
        if (!redemption) {
          return { ok: false as const, code: "NOT_FOUND", message: "兑换记录不存在" };
        }
        if (redemption.status !== "AFTER_SALES_REQUESTED") {
          return { ok: false as const, code: "INVALID_STATUS", message: "当前状态不能审核售后" };
        }

        const now = new Date();
        const toStatus = approve ? "AFTER_SALES_APPROVED" : "AFTER_SALES_REJECTED";
        const updated = await tx.pointRedemption.updateMany({
          where: { id: redemptionId, status: "AFTER_SALES_REQUESTED" },
          data: {
            status: toStatus,
            afterSalesReviewedAt: now,
            afterSalesReviewedById: adminId,
            afterSalesReviewNote: note?.trim() || null,
            afterSalesApprovedAt: approve ? now : null,
          },
        });
        if (updated.count === 0) {
          return { ok: false as const, code: "ALREADY_PROCESSED", message: "售后已处理" };
        }

        const cycle = redemption.afterSalesRequestedAt?.getTime() ?? now.getTime();
        const eventKey = `after-sales-review:${redemptionId}:${cycle}:${toStatus}`;
        await appendEvent(tx, {
          redemptionId,
          fromStatus: "AFTER_SALES_REQUESTED",
          toStatus,
          actorType: "ADMIN",
          actorId: adminId,
          reasonCode: approve ? "approved" : "rejected",
          reasonText: note?.trim() || null,
          idempotencyKey: eventKey,
        });
        await enqueueStatusNotification(tx, {
          redemptionId,
          userId: redemption.userId,
          phone: redemption.user.phone,
          productName: redemption.productName,
          statusLabel: approve ? "售后审核通过，请寄回商品" : "售后申请未通过",
          eventKey,
          extra: note ? { note } : {},
        });
        return { ok: true as const, status: toStatus };
      })
    );
  } catch (error) {
    apiConsole.error("[RedemptionState] 售后审核失败:", error);
    return { ok: false, code: "INTERNAL_ERROR", message: "售后审核失败" };
  }
}

export async function submitReturnShipment(params: {
  redemptionId: string;
  userId: string;
  waybillNo: string;
  carrier?: string;
}): Promise<{ ok: true; status: "RETURNING" } | { ok: false; code: string; message: string }> {
  const { redemptionId, userId, waybillNo, carrier = "SF" } = params;
  if (!waybillNo.trim()) {
    return { ok: false, code: "WAYBILL_REQUIRED", message: "请填写退回运单号" };
  }
  try {
    return await withPointTxRetry(() =>
      prisma.$transaction(async (tx) => {
        const redemption = await tx.pointRedemption.findUnique({
          where: { id: redemptionId },
          select: {
            id: true,
            userId: true,
            status: true,
            productName: true,
            afterSalesApprovedAt: true,
            user: { select: { phone: true } },
          },
        });
        if (!redemption || redemption.userId !== userId) {
          return { ok: false as const, code: "NOT_FOUND", message: "兑换记录不存在" };
        }
        if (redemption.status !== "AFTER_SALES_APPROVED") {
          return {
            ok: false as const,
            code: "INVALID_STATUS",
            message: "当前状态不能填写退回运单",
          };
        }
        if (windowExpired(redemption.afterSalesApprovedAt, RETURN_WINDOW_DAYS)) {
          return { ok: false as const, code: "RETURN_WINDOW_EXPIRED", message: "已超过寄回期限" };
        }

        const now = new Date();
        const updated = await tx.pointRedemption.updateMany({
          where: { id: redemptionId, status: "AFTER_SALES_APPROVED" },
          data: {
            status: "RETURNING",
            returnWaybillNo: waybillNo.trim(),
            returnCarrier: carrier,
            returnShippedAt: now,
          },
        });
        if (updated.count === 0) {
          return { ok: false as const, code: "ALREADY_PROCESSED", message: "兑换状态已变化" };
        }

        const eventKey = `after-sales-return-shipped:${redemptionId}`;
        await appendEvent(tx, {
          redemptionId,
          fromStatus: "AFTER_SALES_APPROVED",
          toStatus: "RETURNING",
          actorType: "USER",
          actorId: userId,
          reasonCode: "return_shipped",
          metadata: { waybillNo: waybillNo.trim(), carrier },
          idempotencyKey: eventKey,
        });
        return { ok: true as const, status: "RETURNING" as const };
      })
    );
  } catch (error) {
    apiConsole.error("[RedemptionState] 填写退回运单失败:", error);
    return { ok: false, code: "INTERNAL_ERROR", message: "填写退回运单失败" };
  }
}

export async function receiveReturn(params: {
  redemptionId: string;
  adminId: string;
  restockApproved: boolean;
  note?: string;
}): Promise<{ ok: true; status: "RETURNED" } | { ok: false; code: string; message: string }> {
  const { redemptionId, adminId, restockApproved, note } = params;
  try {
    return await withPointTxRetry(() =>
      prisma.$transaction(async (tx) => {
        const redemption = await tx.pointRedemption.findUnique({
          where: { id: redemptionId },
          select: {
            id: true,
            userId: true,
            status: true,
            productName: true,
            user: { select: { phone: true } },
          },
        });
        if (!redemption) {
          return { ok: false as const, code: "NOT_FOUND", message: "兑换记录不存在" };
        }
        if (redemption.status !== "RETURNING" && redemption.status !== "AFTER_SALES_APPROVED") {
          return { ok: false as const, code: "INVALID_STATUS", message: "当前状态不能确认收货" };
        }

        const now = new Date();
        const updated = await tx.pointRedemption.updateMany({
          where: { id: redemptionId, status: redemption.status },
          data: {
            status: "RETURNED",
            returnReceivedAt: now,
            inspectionNote: note?.trim() || null,
            restockApproved,
          },
        });
        if (updated.count === 0) {
          return { ok: false as const, code: "ALREADY_PROCESSED", message: "兑换状态已变化" };
        }

        const eventKey = `after-sales-return-received:${redemptionId}`;
        await appendEvent(tx, {
          redemptionId,
          fromStatus: redemption.status,
          toStatus: "RETURNED",
          actorType: "ADMIN",
          actorId: adminId,
          reasonCode: "return_received",
          reasonText: note?.trim() || null,
          metadata: { restockApproved },
          idempotencyKey: eventKey,
        });
        await enqueueStatusNotification(tx, {
          redemptionId,
          userId: redemption.userId,
          phone: redemption.user.phone,
          productName: redemption.productName,
          statusLabel: "退货已签收，等待退款",
          eventKey,
        });
        return { ok: true as const, status: "RETURNED" as const };
      })
    );
  } catch (error) {
    apiConsole.error("[RedemptionState] 确认收到退货失败:", error);
    return { ok: false, code: "INTERNAL_ERROR", message: "确认收到退货失败" };
  }
}

export async function refundAfterSales(params: {
  redemptionId: string;
  adminId: string;
  note?: string;
}): Promise<
  { ok: true; status: "REFUNDED"; points: number } | { ok: false; code: string; message: string }
> {
  const { redemptionId, adminId, note } = params;
  try {
    return await withPointTxRetry(() =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "PointRedemption" WHERE "id" = ${redemptionId} FOR UPDATE`;
        const redemption = await tx.pointRedemption.findUnique({
          where: { id: redemptionId },
          select: {
            id: true,
            userId: true,
            status: true,
            points: true,
            productName: true,
            productId: true,
            stockDeducted: true,
            restockApproved: true,
            stockRestored: true,
            user: { select: { phone: true, status: true } },
          },
        });
        if (!redemption) {
          return { ok: false as const, code: "NOT_FOUND", message: "兑换记录不存在" };
        }
        if (redemption.status !== "RETURNED") {
          return { ok: false as const, code: "INVALID_STATUS", message: "当前状态不能退款" };
        }
        if (redemption.user.status === "DELETED") {
          return { ok: false as const, code: "USER_DELETED", message: "账号已注销，不能退分" };
        }

        const now = new Date();
        const updated = await tx.pointRedemption.updateMany({
          where: { id: redemptionId, status: "RETURNED" },
          data: {
            status: "REFUNDED",
            refundedPoints: redemption.points,
            refundedAt: now,
          },
        });
        if (updated.count === 0) {
          return { ok: false as const, code: "ALREADY_PROCESSED", message: "退款已处理" };
        }

        await adjustPoints(tx, {
          userId: redemption.userId,
          amount: redemption.points,
          reference: `after-sales-refund:${redemptionId}`,
          note: note?.trim() || `售后退款：${redemption.productName}`,
        });

        const productId = redemption.productId;
        const willRestock = Boolean(
          redemption.restockApproved &&
          !redemption.stockRestored &&
          redemption.stockDeducted &&
          productId
        );
        if (willRestock && productId) {
          const restocked = await tx.pointRedemption.updateMany({
            where: { id: redemptionId, stockRestored: false },
            data: { stockRestored: true, stockRestoredAt: now },
          });
          if (restocked.count > 0) {
            await tx.product.updateMany({
              where: { id: productId, redeemStock: { not: null } },
              data: { redeemStock: { increment: 1 } },
            });
          }
        }

        const eventKey = `after-sales-refund:${redemptionId}`;
        await appendEvent(tx, {
          redemptionId,
          fromStatus: "RETURNED",
          toStatus: "REFUNDED",
          actorType: "ADMIN",
          actorId: adminId,
          reasonCode: "refunded",
          reasonText: note?.trim() || null,
          metadata: {
            points: redemption.points,
            restocked: willRestock,
          },
          idempotencyKey: eventKey,
        });
        await enqueueStatusNotification(tx, {
          redemptionId,
          userId: redemption.userId,
          phone: redemption.user.phone,
          productName: redemption.productName,
          statusLabel: "退款已完成，积分已退回",
          eventKey,
          extra: { points: redemption.points },
        });
        return { ok: true as const, status: "REFUNDED" as const, points: redemption.points };
      })
    );
  } catch (error) {
    apiConsole.error("[RedemptionState] 售后退款失败:", error);
    return { ok: false, code: "INTERNAL_ERROR", message: "售后退款失败" };
  }
}

export async function closeAfterSales(params: {
  redemptionId: string;
  actorType: "ADMIN" | "SYSTEM";
  actorId?: string | null;
  reason: string;
}): Promise<boolean> {
  const { redemptionId, actorType, actorId, reason } = params;
  return withPointTxRetry(() =>
    prisma.$transaction(async (tx) => {
      const redemption = await tx.pointRedemption.findUnique({
        where: { id: redemptionId },
        select: {
          id: true,
          userId: true,
          status: true,
          productName: true,
          user: { select: { status: true, phone: true } },
        },
      });
      if (!redemption || !ACTIVE_AFTER_SALES_STATUSES.includes(redemption.status)) return false;

      const now = new Date();
      const updated = await tx.pointRedemption.updateMany({
        where: { id: redemptionId, status: redemption.status },
        data: {
          status: "AFTER_SALES_CLOSED",
          afterSalesClosedAt: now,
          afterSalesReviewNote: reason,
        },
      });
      if (updated.count === 0) return false;

      const eventKey = `after-sales-closed:${redemptionId}:${now.getTime()}`;
      await appendEvent(tx, {
        redemptionId,
        fromStatus: redemption.status,
        toStatus: "AFTER_SALES_CLOSED",
        actorType,
        actorId,
        reasonCode: "closed",
        reasonText: reason,
        idempotencyKey: eventKey,
      });
      if (redemption.user.status !== "DELETED") {
        await enqueueStatusNotification(tx, {
          redemptionId,
          userId: redemption.userId,
          phone: redemption.user.phone,
          productName: redemption.productName,
          statusLabel: "售后已关闭",
          eventKey,
          extra: { note: reason },
        });
      }
      return true;
    })
  );
}

export async function closeStaleAfterSales(
  options: { days?: number; limit?: number } = {}
): Promise<number> {
  const days = options.days ?? RETURN_WINDOW_DAYS;
  const limit = Math.min(500, Math.max(1, options.limit ?? 200));
  const rows = await prisma.pointRedemption.findMany({
    where: {
      status: "AFTER_SALES_APPROVED",
      afterSalesApprovedAt: { lt: daysAgo(days) },
    },
    select: { id: true },
    take: limit,
    orderBy: { afterSalesApprovedAt: "asc" },
  });
  let closed = 0;
  for (const row of rows) {
    if (
      await closeAfterSales({
        redemptionId: row.id,
        actorType: "SYSTEM",
        reason: `超过 ${days} 天未寄回，售后自动关闭`,
      })
    ) {
      closed += 1;
    }
  }
  return closed;
}

export async function getRedemptionTimeline(redemptionId: string, userId?: string) {
  const redemption = await prisma.pointRedemption.findUnique({
    where: { id: redemptionId },
    select: {
      id: true,
      userId: true,
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
      completedAt: true,
      cancelledAt: true,
      cancelNote: true,
      afterSalesRequestedAt: true,
      afterSalesReason: true,
      afterSalesImages: true,
      afterSalesReviewedAt: true,
      afterSalesReviewNote: true,
      afterSalesApprovedAt: true,
      afterSalesClosedAt: true,
      returnWaybillNo: true,
      returnCarrier: true,
      returnShippedAt: true,
      returnReceivedAt: true,
      inspectionNote: true,
      refundedPoints: true,
      refundedAt: true,
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          actorType: true,
          reasonCode: true,
          reasonText: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });
  if (!redemption || (userId && redemption.userId !== userId)) return null;
  return redemption;
}

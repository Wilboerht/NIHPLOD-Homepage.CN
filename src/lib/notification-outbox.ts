/**
 * 事务性通知 Outbox。
 *
 * 业务事务内 enqueue，worker 通过 SKIP LOCKED 批量 claim，失败指数退避，
 * 达到上限进入 DEAD；配置/模板/未绑定等不可重试错误进入 SKIPPED。
 *
 * 投递语义为 at-least-once：若供应商已接收但在标记 SENT 前进程崩溃，
 * 租约回收后会再次发送。短信/微信/小程序接口没有通用幂等键，无法在此层
 * 保证 exactly-once；对重复极敏感的通知应使用供应商侧去重能力。
 */
import { randomUUID } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import type { NotificationChannel } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import {
  dispatchNotificationOutbox,
  type NotificationOutboxJob,
  type NotificationSendResult,
} from "@/lib/notification-adapters";

export interface EnqueueNotificationInput {
  idempotencyKey: string;
  channel: NotificationChannel;
  eventType: string;
  payload: Prisma.InputJsonValue;
  userId?: string | null;
  recipient?: Prisma.InputJsonValue;
  templateKey?: string | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  maxAttempts?: number;
}

type Tx = Prisma.TransactionClient;

/** 事务内入队；不传 tx 时使用全局 client。重复 idempotencyKey 返回已有记录。 */
export async function enqueueNotification(
  input: EnqueueNotificationInput,
  tx?: Tx
): Promise<string> {
  const client = tx ?? prisma;
  // 测试/轻量 mock 兼容；生产环境缺少模型必须 fail-fast，避免静默丢通知
  if (!client.notificationOutbox) {
    if (process.env.NODE_ENV === "test") return "";
    throw new Error("NOTIFICATION_OUTBOX_UNAVAILABLE");
  }
  try {
    const row = await client.notificationOutbox.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        channel: input.channel,
        eventType: input.eventType,
        userId: input.userId ?? null,
        recipient: input.recipient,
        templateKey: input.templateKey ?? null,
        payload: input.payload,
        aggregateType: input.aggregateType ?? null,
        aggregateId: input.aggregateId ?? null,
        maxAttempts: input.maxAttempts ?? 6,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await client.notificationOutbox.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    throw error;
  }
}

interface ClaimedRow {
  id: string;
  channel: NotificationChannel;
  eventType: string;
  userId: string | null;
  recipient: unknown;
  templateKey: string | null;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

const OUTBOX_LEASE_MS = 15 * 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

function backoffFor(attempts: number): Date {
  const index = Math.min(Math.max(0, attempts - 1), RETRY_DELAYS_MS.length - 1);
  return new Date(Date.now() + RETRY_DELAYS_MS[index]);
}

async function claimBatch(limit: number): Promise<{ rows: ClaimedRow[]; leaseToken: string }> {
  const leaseToken = randomUUID();
  const lockedUntil = new Date(Date.now() + OUTBOX_LEASE_MS);
  const rows = await prisma.$queryRaw<ClaimedRow[]>`
    UPDATE "NotificationOutbox"
    SET "status" = 'SENDING',
        "leaseToken" = ${leaseToken},
        "lockedUntil" = ${lockedUntil},
        "attempts" = "attempts" + 1,
        "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id"
      FROM "NotificationOutbox"
      WHERE "status" = 'PENDING'
        AND "nextAttemptAt" <= NOW()
        AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW())
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "channel", "eventType", "userId", "recipient", "templateKey",
              "payload", "attempts", "maxAttempts"
  `;
  return { rows, leaseToken };
}

function terminalPiiScrub(row: ClaimedRow): Record<string, unknown> {
  // 注销回执只需要手机号完成一次发送；终态立即脱敏，避免明文手机号保留 180 天
  return row.eventType === "account_deleted" ? { recipient: Prisma.JsonNull, payload: {} } : {};
}

async function finishSuccess(row: ClaimedRow, leaseToken: string, result: NotificationSendResult) {
  await prisma.notificationOutbox.updateMany({
    where: { id: row.id, status: "SENDING", leaseToken },
    data: {
      status: "SENT",
      sentAt: new Date(),
      lastError: null,
      providerMessageId: result.providerMessageId ?? null,
      leaseToken: null,
      lockedUntil: null,
      ...terminalPiiScrub(row),
    },
  });
}

async function finishFailure(
  row: ClaimedRow,
  leaseToken: string,
  result: NotificationSendResult
): Promise<"PENDING" | "DEAD" | "SKIPPED"> {
  const error = (result.error ?? "发送失败").slice(0, 2000);
  const terminalByAttempts = row.attempts >= row.maxAttempts;
  const status: "PENDING" | "DEAD" | "SKIPPED" = result.skipped
    ? "SKIPPED"
    : !result.retryable || terminalByAttempts
      ? "DEAD"
      : "PENDING";

  await prisma.notificationOutbox.updateMany({
    where: { id: row.id, status: "SENDING", leaseToken },
    data: {
      status,
      lastError: error,
      leaseToken: null,
      lockedUntil: null,
      ...(status === "PENDING" ? { nextAttemptAt: backoffFor(row.attempts) } : terminalPiiScrub(row)),
    },
  });
  return status;
}

export interface ProcessOutboxResult {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  skipped: number;
  failed: number;
}

export async function processNotificationOutbox(
  options: { limit?: number } = {}
): Promise<ProcessOutboxResult> {
  const requested = options.limit ?? 50;
  const limit = Math.min(10, Math.max(1, Number.isFinite(requested) ? requested : 10));
  // 回收发送中崩溃/超时的租约，避免 SENDING 永久卡住
  await prisma.notificationOutbox.updateMany({
    where: {
      status: "SENDING",
      OR: [{ lockedUntil: { lt: new Date() } }, { lockedUntil: null }],
    },
    data: { status: "PENDING", leaseToken: null, lockedUntil: null },
  });
  const { rows, leaseToken } = await claimBatch(limit);
  const stats: ProcessOutboxResult = {
    claimed: rows.length,
    sent: 0,
    retried: 0,
    dead: 0,
    skipped: 0,
    failed: 0,
  };

  for (const row of rows) {
    const job: NotificationOutboxJob = {
      id: row.id,
      channel: row.channel,
      eventType: row.eventType,
      userId: row.userId,
      recipient: row.recipient,
      templateKey: row.templateKey,
      payload: row.payload,
    };
    try {
      const result = await dispatchNotificationOutbox(job);
      if (result.ok) {
        await finishSuccess(row, leaseToken, result);
        stats.sent += 1;
      } else {
        const status = await finishFailure(row, leaseToken, result);
        if (status === "PENDING") stats.retried += 1;
        else if (status === "DEAD") stats.dead += 1;
        else stats.skipped += 1;
      }
    } catch (error) {
      stats.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      apiConsole.error("[NotificationOutbox] 发送异常:", { id: row.id, error: message });
      await finishFailure(row, leaseToken, {
        ok: false,
        retryable: true,
        error: message,
      }).catch((updateError) =>
        apiConsole.error("[NotificationOutbox] 失败状态写入失败:", updateError)
      );
    }
  }

  return stats;
}

export async function requeueNotificationOutbox(id: string): Promise<boolean> {
  const updated = await prisma.notificationOutbox.updateMany({
    where: { id, status: { in: ["DEAD", "SKIPPED"] } },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
      leaseToken: null,
      lockedUntil: null,
    },
  });
  return updated.count > 0;
}

export async function discardNotificationOutbox(id: string): Promise<boolean> {
  const updated = await prisma.notificationOutbox.updateMany({
    where: { id, status: { in: ["PENDING", "DEAD", "SKIPPED"] } },
    data: {
      status: "SKIPPED",
      lastError: "管理员已丢弃",
      leaseToken: null,
      lockedUntil: null,
    },
  });
  return updated.count > 0;
}

/** 清理已终态的历史通知（默认保留 180 天） */
export async function cleanupNotificationOutbox(
  retentionDays = Number(process.env.NOTIFICATION_OUTBOX_RETENTION_DAYS || 180)
): Promise<number> {
  const days = Number.isFinite(retentionDays) ? Math.max(1, retentionDays) : 180;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await prisma.notificationOutbox.deleteMany({
    where: {
      status: { in: ["SENT", "DEAD", "SKIPPED"] },
      updatedAt: { lt: cutoff },
    },
  });
  return deleted.count;
}

/** 账号注销：删除未发送/死信，脱敏已发送记录中的 recipient/payload */
export async function purgeNotificationOutboxForUser(tx: Tx, userId: string): Promise<void> {
  if (!tx.notificationOutbox) {
    if (process.env.NODE_ENV === "test") return;
    throw new Error("NOTIFICATION_OUTBOX_UNAVAILABLE");
  }
  await tx.notificationOutbox.deleteMany({
    where: { userId, status: { in: ["PENDING", "SENDING", "DEAD"] } },
  });
  await tx.notificationOutbox.updateMany({
    where: { userId },
    data: {
      recipient: Prisma.JsonNull,
      payload: {},
      aggregateId: null,
      lastError: null,
    },
  });
}

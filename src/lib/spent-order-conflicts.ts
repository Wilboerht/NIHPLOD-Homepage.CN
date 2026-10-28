/**
 * 消费订单跨来源冲突扫描（只读）。
 *
 * 检查同一用户同一订单号是否同时存在于以下任意两条链路：
 * - 成功且未撤销的 Excel 导入行
 * - 已通过的消费补录申请
 * - 商城消费额同步记录（SpentSyncRecord）
 *
 * 新数据在写入时由 SpentOrderClaim 强约束；本扫描用于发现历史数据和极小概率异常。
 */
import { prisma } from "@/lib/prisma";
import { normalizeOrderNo } from "@/lib/spent-order";

type ConflictSource = "IMPORT" | "ADJUSTMENT" | "MALL_SYNC";

export interface SpentOrderConflictItem {
  userId: string;
  /** 跨用户冲突时返回全部涉及的 userId（单用户冲突时也可只含一个） */
  userIds?: string[];
  orderNo: string;
  sources: ConflictSource[];
  importRowId?: string;
  importBatchId?: string;
  importAmount?: number;
  importAppliedDelta?: number | null;
  importedAt?: string;
  applicationId?: string;
  adjustmentAmount?: number | null;
  adjustmentChannel?: string;
  reviewedAt?: string | null;
  mallReference?: string;
  mallAmount?: number;
  mallSyncedAt?: string;
}

export interface SpentOrderConflictResult {
  since: string;
  count: number;
  items: SpentOrderConflictItem[];
  truncated: boolean;
}

export async function findSpentOrderConflicts(
  options: { sinceDays?: number; limit?: number } = {}
): Promise<SpentOrderConflictResult> {
  const sinceDays = Math.min(365, Math.max(1, options.sinceDays ?? 90));
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const imports = await prisma.spentImportRow.findMany({
    where: {
      status: "SUCCESS",
      revertedAt: null,
      orderNo: { not: null },
      createdAt: { gte: cutoff },
    },
    select: {
      id: true,
      batchId: true,
      userId: true,
      orderNo: true,
      amount: true,
      appliedDelta: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const mallRecords = await (prisma.spentSyncRecord?.findMany
    ? prisma.spentSyncRecord.findMany({
        where: {
          // 只统计外部商城同步记录；导入/补录自身也会写 SpentSyncRecord，
          // 不过滤来源会把正常入账误报成“导入 + 商城同步”冲突。
          source: "MALL_SYNC",
          spentDelta: { gt: 0 },
          revertedAt: null,
          orderNoKey: { not: null },
          createdAt: { gte: cutoff },
        },
        select: {
          userId: true,
          orderNo: true,
          orderNoKey: true,
          reference: true,
          spentDelta: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : Promise.resolve([]));

  const applications = await prisma.spentAdjustmentApplication.findMany({
    where: {
      status: "APPROVED",
      orderNo: { not: "" },
      reviewedAt: { gte: cutoff },
    },
    select: {
      id: true,
      userId: true,
      orderNo: true,
      amountClaimed: true,
      reviewAmount: true,
      channel: true,
      reviewedAt: true,
    },
  });

  if (imports.length === 0 && mallRecords.length === 0 && applications.length === 0) {
    return { since: cutoff.toISOString(), count: 0, items: [], truncated: false };
  }

  type ConflictBucket = {
    users: Set<string>;
    imported?: (typeof imports)[number];
    application?: (typeof applications)[number];
    mall?: (typeof mallRecords)[number];
  };

  const buckets = new Map<string, ConflictBucket>();
  const getBucket = (orderNoKey: string): ConflictBucket => {
    let bucket = buckets.get(orderNoKey);
    if (!bucket) {
      bucket = { users: new Set<string>() };
      buckets.set(orderNoKey, bucket);
    }
    return bucket;
  };

  for (const row of imports) {
    if (!row.userId || !row.orderNo) continue;
    const bucket = getBucket(normalizeOrderNo(row.orderNo));
    bucket.users.add(row.userId);
    bucket.imported ??= row;
  }

  for (const application of applications) {
    if (!application.userId || !application.orderNo) continue;
    const bucket = getBucket(normalizeOrderNo(application.orderNo));
    bucket.users.add(application.userId);
    bucket.application ??= application;
  }

  for (const record of mallRecords) {
    if (!record.orderNoKey) continue;
    const bucket = getBucket(record.orderNoKey);
    bucket.users.add(record.userId);
    bucket.mall ??= record;
  }

  const allConflicts: SpentOrderConflictItem[] = [];

  for (const [orderNoKey, bucket] of buckets) {
    const imported = bucket.imported;
    const application = bucket.application;
    const mall = bucket.mall;
    const sources: ConflictSource[] = [];
    if (imported) sources.push("IMPORT");
    if (application) sources.push("ADJUSTMENT");
    if (mall) sources.push("MALL_SYNC");

    // 同一来源但跨用户同样是 P2 漏洞（例如两个用户各自导入同一订单号）。
    const crossUser = bucket.users.size > 1;
    if (sources.length < 2 && !crossUser) continue;

    const userId = imported?.userId ?? application?.userId ?? mall?.userId ?? "";
    const orderNo = imported?.orderNo ?? application?.orderNo ?? mall?.orderNo ?? orderNoKey;

    allConflicts.push({
      userId,
      userIds: [...bucket.users],
      orderNo,
      sources,
      ...(imported
        ? {
            importRowId: imported.id,
            importBatchId: imported.batchId,
            importAmount: imported.amount,
            importAppliedDelta: imported.appliedDelta,
            importedAt: imported.createdAt.toISOString(),
          }
        : {}),
      ...(application
        ? {
            applicationId: application.id,
            adjustmentAmount: application.reviewAmount ?? application.amountClaimed,
            adjustmentChannel: application.channel,
            reviewedAt: application.reviewedAt?.toISOString() ?? null,
          }
        : {}),
      ...(mall
        ? {
            mallReference: mall.reference,
            mallAmount: mall.spentDelta,
            mallSyncedAt: mall.createdAt.toISOString(),
          }
        : {}),
    });
  }

  return {
    since: cutoff.toISOString(),
    count: allConflicts.length,
    items: allConflicts.slice(0, limit),
    truncated: allConflicts.length > limit,
  };
}

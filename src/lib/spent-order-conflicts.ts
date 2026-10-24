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

  if (imports.length === 0 && mallRecords.length === 0) {
    return { since: cutoff.toISOString(), count: 0, items: [], truncated: false };
  }

  const userIds = [
    ...new Set(
      [...imports.map((row) => row.userId), ...mallRecords.map((row) => row.userId)].filter(
        (id): id is string => !!id
      )
    ),
  ];
  const applications = await prisma.spentAdjustmentApplication.findMany({
    where: {
      userId: { in: userIds },
      status: "APPROVED",
      orderNo: { not: "" },
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

  const importByOrder = new Map<string, (typeof imports)[number]>();
  for (const row of imports) {
    if (!row.userId || !row.orderNo) continue;
    const key = `${row.userId}:${normalizeOrderNo(row.orderNo)}`;
    if (!importByOrder.has(key)) importByOrder.set(key, row);
  }

  const applicationByOrder = new Map<string, (typeof applications)[number]>();
  for (const application of applications) {
    const key = `${application.userId}:${normalizeOrderNo(application.orderNo)}`;
    if (!applicationByOrder.has(key)) applicationByOrder.set(key, application);
  }

  const mallByOrder = new Map<
    string,
    {
      userId: string;
      orderNo: string | null;
      reference: string;
      spentDelta: number;
      createdAt: Date;
    }
  >();
  for (const record of mallRecords) {
    if (!record.orderNoKey) continue;
    const key = `${record.userId}:${record.orderNoKey}`;
    if (!mallByOrder.has(key)) mallByOrder.set(key, record);
  }

  const keys = new Set([
    ...importByOrder.keys(),
    ...applicationByOrder.keys(),
    ...mallByOrder.keys(),
  ]);
  const allConflicts: SpentOrderConflictItem[] = [];

  for (const key of keys) {
    const imported = importByOrder.get(key);
    const application = applicationByOrder.get(key);
    const mall = mallByOrder.get(key);
    const sources: ConflictSource[] = [];
    if (imported) sources.push("IMPORT");
    if (application) sources.push("ADJUSTMENT");
    if (mall) sources.push("MALL_SYNC");
    if (sources.length < 2) continue;

    const userId = key.slice(0, key.indexOf(":"));
    const orderNo =
      imported?.orderNo ??
      application?.orderNo ??
      mall?.orderNo ??
      key.slice(key.indexOf(":") + 1);

    allConflicts.push({
      userId,
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

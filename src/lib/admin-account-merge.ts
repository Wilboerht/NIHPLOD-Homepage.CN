import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { advisorRequest, getSubsitePurgeTargets } from "@/lib/advisor-internal";
import { createAuditLogTx } from "@/lib/audit";
import { calculateLevel, invalidateProfileCache, pushMembershipUpdateWebhook } from "@/lib/points";
import { enqueueSecurityActionNotification } from "@/lib/security-notify";
import { maskPhone } from "@/lib/mask-phone";
import { apiConsole } from "@/lib/logger";
import type { AdminUser } from "@/types/auth";
import { AccountSecurityError } from "@/lib/admin-account-security";

interface MergeConflict {
  code: string;
  message: string;
  references?: string[];
}

interface MergeUsers {
  source: {
    id: string;
    phone: string;
    status: string;
    nickname: string | null;
    totalSpent: number;
    membershipLevel: "REGULAR" | "SILVER" | "GOLD" | "DIAMOND";
    updatedAt: Date;
    wechatOpenId: string | null;
    wechatUnionId: string | null;
    lastBirthdayRewardYear: number | null;
    silverActivatedAt: Date | null;
    goldActivatedAt: Date | null;
    diamondActivatedAt: Date | null;
  };
  target: MergeUsers["source"];
}

const userMergeSelect = {
  id: true,
  phone: true,
  status: true,
  nickname: true,
  totalSpent: true,
  membershipLevel: true,
  updatedAt: true,
  wechatOpenId: true,
  wechatUnionId: true,
  lastBirthdayRewardYear: true,
  silverActivatedAt: true,
  goldActivatedAt: true,
  diamondActivatedAt: true,
} as const;

async function referenceConflicts(
  sourceUserId: string,
  targetUserId: string
): Promise<MergeConflict[]> {
  const [ledger, spent, redemptions, levels, adjustments, imports, claims] = await Promise.all([
    prisma.$queryRaw<{ reference: string }[]>`
      SELECT s.reference FROM "PointLedger" s
      JOIN "PointLedger" t
        ON t."userId" = ${targetUserId}
        AND t.reference = CASE
          WHEN s.type IN ('CHECKIN', 'BIRTHDAY')
            THEN split_part(s.reference, ':', 1) || ':' || ${targetUserId} || ':' || split_part(s.reference, ':', 3)
          ELSE s.reference
        END
      WHERE s."userId" = ${sourceUserId} LIMIT 20
    `,
    prisma.$queryRaw<{ reference: string }[]>`
      SELECT s.reference FROM "SpentSyncRecord" s
      JOIN "SpentSyncRecord" t ON t.reference = s.reference AND t."userId" = ${targetUserId}
      WHERE s."userId" = ${sourceUserId} LIMIT 20
    `,
    prisma.$queryRaw<{ reference: string }[]>`
      SELECT s.reference FROM "PointRedemption" s
      JOIN "PointRedemption" t ON t.reference = s.reference AND t."userId" = ${targetUserId}
      WHERE s."userId" = ${sourceUserId} LIMIT 20
    `,
    prisma.$queryRaw<{ reference: string }[]>`
      SELECT s.reference FROM "MembershipLevelChange" s
      JOIN "MembershipLevelChange" t ON t.reference = s.reference AND t."userId" = ${targetUserId}
      WHERE s."userId" = ${sourceUserId} LIMIT 20
    `,
    prisma.$queryRaw<{ requestId: string }[]>`
      SELECT s."requestId" FROM "SpentAdjustmentApplication" s
      JOIN "SpentAdjustmentApplication" t
        ON t."requestId" = s."requestId" AND t."userId" = ${targetUserId}
      WHERE s."userId" = ${sourceUserId} AND s."requestId" IS NOT NULL LIMIT 20
    `,
    prisma.$queryRaw<{ key: string }[]>`
      SELECT DISTINCT s."syncReference" AS key FROM "SpentImportRow" s
      JOIN "SpentImportRow" t
        ON t."userId" = ${targetUserId}
        AND (t."syncReference" = s."syncReference" OR t."orderNoKey" = s."orderNoKey")
      WHERE s."userId" = ${sourceUserId}
        AND (s."syncReference" IS NOT NULL OR s."orderNoKey" IS NOT NULL) LIMIT 20
    `,
    prisma.$queryRaw<{ orderNoKey: string }[]>`
      SELECT s."orderNoKey" FROM "SpentOrderClaim" s
      JOIN "SpentOrderClaim" t ON t."orderNoKey" = s."orderNoKey" AND t."userId" = ${targetUserId}
      WHERE s."userId" = ${sourceUserId} LIMIT 20
    `,
  ]);
  const conflicts: MergeConflict[] = [];
  if (ledger.length)
    conflicts.push({
      code: "POINT_LEDGER_CONFLICT",
      message: "两账户存在相同积分幂等流水，需人工核查后再合并",
      references: ledger.map((row) => row.reference),
    });
  if (spent.length)
    conflicts.push({
      code: "SPENT_REFERENCE_CONFLICT",
      message: "两账户存在相同消费入账流水",
      references: spent.map((row) => row.reference),
    });
  if (redemptions.length)
    conflicts.push({
      code: "REDEMPTION_REFERENCE_CONFLICT",
      message: "两账户存在相同兑换请求编号",
      references: redemptions.map((row) => row.reference),
    });
  if (levels.length)
    conflicts.push({
      code: "LEVEL_REFERENCE_CONFLICT",
      message: "两账户存在相同等级变更幂等记录",
      references: levels.map((row) => row.reference),
    });
  if (adjustments.length)
    conflicts.push({
      code: "ADJUSTMENT_REQUEST_CONFLICT",
      message: "两账户存在相同消费补录请求编号",
      references: adjustments.map((row) => row.requestId),
    });
  if (imports.length)
    conflicts.push({
      code: "IMPORT_ROW_CONFLICT",
      message: "两账户存在相同消费导入行或订单号",
      references: imports.map((row) => row.key),
    });
  if (claims.length)
    conflicts.push({
      code: "ORDER_CLAIM_CONFLICT",
      message: "两账户占用了相同消费订单，不能自动合并",
      references: claims.map((row) => row.orderNoKey),
    });
  return conflicts;
}

async function callSubsiteMerge(
  sourceUserId: string,
  targetUserId: string,
  operationId: string,
  mode: "preflight" | "execute"
) {
  for (const target of getSubsitePurgeTargets()) {
    const mergePath = target.purgePath.endsWith("/purge")
      ? `${target.purgePath.slice(0, -"/purge".length)}/merge`
      : "/api/internal/user-data/merge";
    const result = await advisorRequest<{
      success?: boolean;
      canMerge?: boolean;
      message?: string;
      error?: { message?: string };
    }>(mergePath, {
      method: "POST",
      query: { sourceUserId, targetUserId, operationId, mode },
      body: { sourceUserId, targetUserId, operationId, mode },
      baseUrl: target.baseUrl,
      project: target.project ?? target.name,
      signQuery: true,
      timeoutMs: 15_000,
    });
    if (!result.ok) {
      throw new AccountSecurityError(
        "SUBSITE_MERGE_UNAVAILABLE",
        `子站 ${target.name} 不支持或无法完成账户合并${mode === "preflight" ? "预检" : ""}：${result.message}`,
        409
      );
    }
    if (result.data?.success !== true || (mode === "preflight" && result.data.canMerge !== true)) {
      throw new AccountSecurityError(
        "SUBSITE_MERGE_REJECTED",
        `子站 ${target.name} 拒绝账户合并：${result.data?.message || result.data?.error?.message || "未确认可合并"}`,
        409
      );
    }
  }
}

export async function getAccountMergePreflight(
  sourceUserId: string,
  targetUserId: string,
  options: { checkSubsites?: boolean } = {}
) {
  if (sourceUserId === targetUserId) {
    throw new AccountSecurityError("SAME_ACCOUNT", "源账户与目标账户不能相同", 400);
  }
  const [source, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: sourceUserId }, select: userMergeSelect }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: userMergeSelect }),
  ]);
  if (!source || !target)
    throw new AccountSecurityError("NOT_FOUND", "源账户或目标账户不存在", 404);
  if (source.status === "DELETED")
    throw new AccountSecurityError("SOURCE_DELETED", "源账户已注销或合并");
  if (target.status !== "ACTIVE")
    throw new AccountSecurityError("TARGET_NOT_ACTIVE", "目标账户必须为正常状态");

  const conflicts = await referenceConflicts(sourceUserId, targetUserId);
  const [
    sourceAddresses,
    targetAddresses,
    sourceBalance,
    targetBalance,
    sourceDeletion,
    targetDeletion,
  ] = await Promise.all([
    prisma.userAddress.count({ where: { userId: sourceUserId } }),
    prisma.userAddress.count({ where: { userId: targetUserId } }),
    prisma.pointBalance.findUnique({
      where: { userId: sourceUserId },
      select: { available: true },
    }),
    prisma.pointBalance.findUnique({
      where: { userId: targetUserId },
      select: { available: true },
    }),
    prisma.accountDeletionRequest.findUnique({
      where: { userId: sourceUserId },
      select: { status: true },
    }),
    prisma.accountDeletionRequest.findUnique({
      where: { userId: targetUserId },
      select: { status: true },
    }),
  ]);
  if (sourceAddresses + targetAddresses > 20) {
    conflicts.push({ code: "ADDRESS_LIMIT", message: "合并后地址超过 20 条，请先人工精简地址" });
  }
  if (source.wechatOpenId && target.wechatOpenId) {
    conflicts.push({
      code: "WECHAT_OPEN_ID_CONFLICT",
      message: "两账户均有旧版微信 OpenID 字段，需人工确认身份归属",
    });
  }
  if (
    source.wechatUnionId &&
    target.wechatUnionId &&
    source.wechatUnionId !== target.wechatUnionId
  ) {
    conflicts.push({
      code: "WECHAT_UNION_ID_CONFLICT",
      message: "两账户微信 UnionID 不一致，不能自动合并",
    });
  }
  if (sourceDeletion && ["PENDING", "RUNNING"].includes(sourceDeletion.status)) {
    conflicts.push({ code: "SOURCE_DELETION_ACTIVE", message: "源账户有进行中的注销申请" });
  }
  if (targetDeletion && ["PENDING", "RUNNING"].includes(targetDeletion.status)) {
    conflicts.push({ code: "TARGET_DELETION_ACTIVE", message: "目标账户有进行中的注销申请" });
  }
  const nextPoints = (sourceBalance?.available ?? 0) + (targetBalance?.available ?? 0);
  const nextSpent = source.totalSpent + target.totalSpent;
  if (
    !Number.isSafeInteger(nextPoints) ||
    Math.abs(nextPoints) > 2_147_483_647 ||
    !Number.isSafeInteger(nextSpent) ||
    nextSpent > 2_147_483_647
  ) {
    conflicts.push({ code: "NUMBER_LIMIT", message: "合并后的积分或消费额超出系统上限" });
  }
  if ((options.checkSubsites ?? true) && conflicts.length === 0) {
    await callSubsiteMerge(sourceUserId, targetUserId, `preflight:${randomUUID()}`, "preflight");
  }
  return {
    canMerge: conflicts.length === 0,
    conflicts,
    source: {
      ...source,
      phone: maskPhone(source.phone),
      updatedAt: source.updatedAt.toISOString(),
    },
    target: {
      ...target,
      phone: maskPhone(target.phone),
      updatedAt: target.updatedAt.toISOString(),
    },
    preview: {
      pointsBefore: {
        source: sourceBalance?.available ?? 0,
        target: targetBalance?.available ?? 0,
      },
      pointsAfter: nextPoints,
      spentBefore: { source: source.totalSpent, target: target.totalSpent },
      spentAfter: nextSpent,
      levelAfter: calculateLevel(nextSpent),
      addressesAfter: sourceAddresses + targetAddresses,
      sourceSessions: "revoked",
      sourceOAuthConsents: "revoked",
      targetCredentials: "unchanged",
    },
  };
}

type Tx = Prisma.TransactionClient;

async function lockedMergeUsers(
  tx: Tx,
  sourceUserId: string,
  targetUserId: string
): Promise<MergeUsers> {
  const rows = await tx.$queryRaw<MergeUsers["source"][]>`
    SELECT id, phone, status, nickname, "totalSpent", "membershipLevel", "updatedAt",
      "wechatOpenId", "wechatUnionId", "lastBirthdayRewardYear", "silverActivatedAt",
      "goldActivatedAt", "diamondActivatedAt"
    FROM "User" WHERE id IN (${sourceUserId}, ${targetUserId}) ORDER BY id FOR UPDATE
  `;
  const source = rows.find((row) => row.id === sourceUserId);
  const target = rows.find((row) => row.id === targetUserId);
  if (!source || !target) throw new AccountSecurityError("NOT_FOUND", "账户不存在", 404);
  return { source, target };
}

async function assertNoTxConflicts(tx: Tx, sourceUserId: string, targetUserId: string) {
  const checks = [
    tx.$queryRaw<
      { reference: string }[]
    >`SELECT s.reference FROM "PointLedger" s JOIN "PointLedger" t ON t."userId" = ${targetUserId} AND t.reference = CASE WHEN s.type IN ('CHECKIN', 'BIRTHDAY') THEN split_part(s.reference, ':', 1) || ':' || ${targetUserId} || ':' || split_part(s.reference, ':', 3) ELSE s.reference END WHERE s."userId" = ${sourceUserId} LIMIT 1`,
    tx.$queryRaw<
      { reference: string }[]
    >`SELECT s.reference FROM "SpentSyncRecord" s JOIN "SpentSyncRecord" t ON t.reference = s.reference AND t."userId" = ${targetUserId} WHERE s."userId" = ${sourceUserId} LIMIT 1`,
    tx.$queryRaw<
      { reference: string }[]
    >`SELECT s.reference FROM "PointRedemption" s JOIN "PointRedemption" t ON t.reference = s.reference AND t."userId" = ${targetUserId} WHERE s."userId" = ${sourceUserId} LIMIT 1`,
    tx.$queryRaw<
      { reference: string }[]
    >`SELECT s.reference FROM "MembershipLevelChange" s JOIN "MembershipLevelChange" t ON t.reference = s.reference AND t."userId" = ${targetUserId} WHERE s."userId" = ${sourceUserId} LIMIT 1`,
    tx.$queryRaw<
      { requestId: string }[]
    >`SELECT s."requestId" FROM "SpentAdjustmentApplication" s JOIN "SpentAdjustmentApplication" t ON t."requestId" = s."requestId" AND t."userId" = ${targetUserId} WHERE s."userId" = ${sourceUserId} AND s."requestId" IS NOT NULL LIMIT 1`,
    tx.$queryRaw<
      { key: string }[]
    >`SELECT s."syncReference" AS key FROM "SpentImportRow" s JOIN "SpentImportRow" t ON t."userId" = ${targetUserId} AND (t."syncReference" = s."syncReference" OR t."orderNoKey" = s."orderNoKey") WHERE s."userId" = ${sourceUserId} AND (s."syncReference" IS NOT NULL OR s."orderNoKey" IS NOT NULL) LIMIT 1`,
    tx.$queryRaw<
      { orderNoKey: string }[]
    >`SELECT s."orderNoKey" FROM "SpentOrderClaim" s JOIN "SpentOrderClaim" t ON t."orderNoKey" = s."orderNoKey" AND t."userId" = ${targetUserId} WHERE s."userId" = ${sourceUserId} LIMIT 1`,
  ];
  const results = await Promise.all(checks);
  if (results.some((rows) => rows.length > 0)) {
    throw new AccountSecurityError("MERGE_CONFLICT", "检测到新的账本或订单冲突，请重新预检");
  }
}

function earliest(...dates: (Date | null)[]): Date | null {
  const values = dates.filter((date): date is Date => Boolean(date));
  return values.length ? new Date(Math.min(...values.map((date) => date.getTime()))) : null;
}

export async function mergeUserAccounts(input: {
  sourceUserId: string;
  targetUserId: string;
  expectedSourceUpdatedAt: string;
  expectedTargetUpdatedAt: string;
  reason: string;
  actor: Pick<AdminUser, "id"> & { email: string; name: string; role: string };
  operationId?: string;
  request?: NextRequest;
  approvalId?: string;
}) {
  const operationId = input.operationId ?? input.approvalId ?? randomUUID();
  const preflight = await getAccountMergePreflight(input.sourceUserId, input.targetUserId);
  if (!preflight.canMerge) {
    throw new AccountSecurityError(
      "MERGE_CONFLICT",
      preflight.conflicts[0]?.message || "账户存在合并冲突"
    );
  }
  if (
    preflight.source.updatedAt !== input.expectedSourceUpdatedAt ||
    preflight.target.updatedAt !== input.expectedTargetUpdatedAt
  ) {
    throw new AccountSecurityError("STALE", "账户资料已变化，请重新预检");
  }
  await callSubsiteMerge(input.sourceUserId, input.targetUserId, operationId, "execute");

  const now = new Date();
  const result = await prisma.$transaction(
    async (tx) => {
      const { source, target } = await lockedMergeUsers(tx, input.sourceUserId, input.targetUserId);
      // 积分余额也必须锁定：签到/过期/退款只锁 PointBalance、不锁 User，
      // 只用事务外快照做绝对值覆盖会丢更新或复活已过期积分。
      await tx.$queryRaw`
        SELECT "userId" FROM "PointBalance"
        WHERE "userId" IN (${Prisma.join([source.id, target.id].sort())})
        ORDER BY "userId" FOR UPDATE
      `;
      if (source.status === "DELETED" || target.status !== "ACTIVE") {
        throw new AccountSecurityError("STALE", "账户状态已变化，请重新预检");
      }
      if (
        source.updatedAt.toISOString() !== input.expectedSourceUpdatedAt ||
        target.updatedAt.toISOString() !== input.expectedTargetUpdatedAt
      ) {
        throw new AccountSecurityError("STALE", "账户资料已变化，请重新预检");
      }
      await assertNoTxConflicts(tx, source.id, target.id);
      const activeDeletion = await tx.accountDeletionRequest.findFirst({
        where: {
          userId: { in: [source.id, target.id] },
          status: { in: ["PENDING", "RUNNING"] },
        },
        select: { userId: true },
      });
      if (activeDeletion) {
        throw new AccountSecurityError("DELETION_ACTIVE", "账户有进行中的注销申请，不能合并");
      }
      const [sourceAddresses, targetAddresses, sourceBalance, targetBalance, sourceDefaultAddress] =
        await Promise.all([
          tx.userAddress.count({ where: { userId: source.id } }),
          tx.userAddress.count({ where: { userId: target.id } }),
          tx.pointBalance.findUnique({ where: { userId: source.id } }),
          tx.pointBalance.findUnique({ where: { userId: target.id } }),
          tx.userAddress.findFirst({
            where: { userId: source.id, isDefault: true },
            select: { id: true },
          }),
        ]);
      if (sourceAddresses + targetAddresses > 20)
        throw new AccountSecurityError("ADDRESS_LIMIT", "合并后地址超过 20 条");
      if (source.wechatOpenId && target.wechatOpenId)
        throw new AccountSecurityError("WECHAT_OPEN_ID_CONFLICT", "旧版微信 OpenID 冲突");
      if (
        source.wechatUnionId &&
        target.wechatUnionId &&
        source.wechatUnionId !== target.wechatUnionId
      )
        throw new AccountSecurityError("WECHAT_UNION_ID_CONFLICT", "微信 UnionID 冲突");

      const totalSpent = source.totalSpent + target.totalSpent;
      const points = (sourceBalance?.available ?? 0) + (targetBalance?.available ?? 0);
      const nextLevel = calculateLevel(totalSpent);
      const userScopedLedger = await tx.pointLedger.findMany({
        where: { userId: source.id, type: { in: ["CHECKIN", "BIRTHDAY"] } },
        select: { id: true, reference: true },
      });
      for (const ledger of userScopedLedger) {
        const parts = ledger.reference.split(":");
        const [kind, , suffix] = parts;
        if (parts.length !== 3 || !kind || !suffix) {
          throw new AccountSecurityError(
            "LEDGER_REFERENCE_INVALID",
            "历史积分流水格式异常，请人工核查"
          );
        }
        await tx.pointLedger.update({
          where: { id: ledger.id },
          data: { reference: `${kind}:${target.id}:${suffix}` },
        });
      }
      await tx.pointLedger.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.spentSyncRecord.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.spentOrderClaim.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.spentAdjustmentApplication.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.spentImportRow.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.pointRedemption.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.membershipLevelChange.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.externalIdentity.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.loginAttempt.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.contactMessage.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.jobApplication.updateMany({
        where: { userId: source.id },
        data: { userId: target.id },
      });
      await tx.avatarAsset.updateMany({
        where: { userId: source.id },
        data: { userId: target.id, attachedAt: null },
      });
      await tx.userAddress.updateMany({
        where: { userId: source.id },
        data: { userId: target.id, isDefault: false },
      });
      const targetDefaultCount = await tx.userAddress.count({
        where: { userId: target.id, isDefault: true },
      });
      if (targetDefaultCount === 0 && sourceDefaultAddress) {
        await tx.userAddress.update({
          where: { id: sourceDefaultAddress.id },
          data: { isDefault: true },
        });
      }

      if (targetBalance) {
        await tx.pointBalance.update({
          where: { userId: target.id },
          data: { available: points, frozen: 0 },
        });
      } else {
        await tx.pointBalance.create({ data: { userId: target.id, available: points, frozen: 0 } });
      }
      if (sourceBalance) {
        await tx.pointBalance.update({
          where: { userId: source.id },
          data: { available: 0, frozen: 0 },
        });
      }
      if (source.wechatOpenId || source.wechatUnionId) {
        await tx.user.update({
          where: { id: source.id },
          data: { wechatOpenId: null, wechatUnionId: null },
        });
      }
      await tx.user.update({
        where: { id: target.id },
        data: {
          totalSpent,
          membershipLevel: nextLevel,
          lastBirthdayRewardYear:
            Math.max(source.lastBirthdayRewardYear ?? 0, target.lastBirthdayRewardYear ?? 0) ||
            null,
          silverActivatedAt: earliest(source.silverActivatedAt, target.silverActivatedAt),
          goldActivatedAt: earliest(source.goldActivatedAt, target.goldActivatedAt),
          diamondActivatedAt: earliest(source.diamondActivatedAt, target.diamondActivatedAt),
          ...(!target.wechatOpenId && source.wechatOpenId
            ? { wechatOpenId: source.wechatOpenId }
            : {}),
          ...(!target.wechatUnionId && source.wechatUnionId
            ? { wechatUnionId: source.wechatUnionId }
            : {}),
        },
      });
      if (nextLevel !== target.membershipLevel) {
        await tx.membershipLevelChange.create({
          data: {
            userId: target.id,
            fromLevel: target.membershipLevel,
            toLevel: nextLevel,
            reference: `account-merge:${operationId}`,
            note: "账户合并后按累计消费重算等级",
          },
        });
      }

      await tx.refreshToken.updateMany({
        where: { userId: source.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: "account_merge" },
      });
      await tx.oAuthSession.updateMany({
        where: { userId: source.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.userConsent.updateMany({
        where: { userId: source.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.oAuthAuthorizationCode.deleteMany({ where: { userId: source.id } });
      await tx.passwordHistory.deleteMany({ where: { userId: source.id } });
      await tx.accountDeletionRequest.deleteMany({ where: { userId: source.id } });
      await tx.webhookDeliveryFailure.deleteMany({ where: { userId: source.id } });
      await tx.backchannelLogoutFailure.deleteMany({ where: { userId: source.id } });
      await tx.notificationOutbox.updateMany({
        where: { userId: source.id, status: "PENDING" },
        data: { status: "SKIPPED", lastError: `账户已合并至 ${target.id}` },
      });
      await tx.user.update({
        where: { id: source.id },
        data: {
          phone: `merged_${source.id}`,
          phoneVerified: false,
          password: null,
          nickname: "已合并账户",
          avatar: null,
          status: "DELETED",
          sessionsInvalidatedAt: now,
          passwordChangeRequired: false,
          wechatOpenId: null,
          wechatUnionId: null,
          totalSpent: 0,
          membershipLevel: "REGULAR",
          silverActivatedAt: null,
          goldActivatedAt: null,
          diamondActivatedAt: null,
          birthday: null,
          birthdayLocked: false,
          lastBirthdayRewardYear: null,
          gender: null,
        },
      });
      await createAuditLogTx(tx, {
        action: "user_accounts_merge",
        targetType: "user",
        targetId: target.id,
        targetLabel: maskPhone(target.phone),
        detail: {
          sourceUserId: source.id,
          targetUserId: target.id,
          operationId,
          reason: input.reason,
          sourcePhone: maskPhone(source.phone),
          targetPhone: maskPhone(target.phone),
          pointsAfter: points,
          totalSpentAfter: totalSpent,
          levelAfter: nextLevel,
          addressesAfter: sourceAddresses + targetAddresses,
          sourceSessionsRevoked: true,
          sourceOAuthConsentsRevoked: true,
          approvalId: input.approvalId ?? null,
        },
        actorType: "ADMIN",
        actorEmail: input.actor.email,
        actorName: input.actor.name,
        actorRole: input.actor.role,
        authMethod: input.approvalId ? "approval" : "step_up",
        adminId: input.actor.id,
        request: input.request,
      });
      return {
        sourcePhone: source.phone,
        targetPhone: target.phone,
        pointsAfter: points,
        totalSpentAfter: totalSpent,
        levelAfter: nextLevel,
      };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  await Promise.all([
    enqueueSecurityActionNotification({
      userId: input.targetUserId,
      phone: result.sourcePhone,
      action: "重复账户已合并，原账户已停用",
      reference: `account-merge-source:${operationId}`,
    }),
    enqueueSecurityActionNotification({
      userId: input.targetUserId,
      phone: result.targetPhone,
      action: "另一个账户的积分、消费与业务记录已合并到当前账户",
      reference: `account-merge-target:${operationId}`,
    }),
  ]).catch((error) => apiConsole.warn("[AdminAccountMerge] 通知入队失败:", error));

  invalidateProfileCache();
  pushMembershipUpdateWebhook(input.targetUserId, {
    totalSpent: result.totalSpentAfter,
    membershipLevel: result.levelAfter,
  }).catch((error) => apiConsole.warn("[AdminAccountMerge] 会员 webhook 推送失败:", error));

  return {
    operationId,
    sourceUserId: input.sourceUserId,
    targetUserId: input.targetUserId,
    pointsAfter: result.pointsAfter,
    totalSpentAfter: result.totalSpentAfter,
    levelAfter: result.levelAfter,
  };
}

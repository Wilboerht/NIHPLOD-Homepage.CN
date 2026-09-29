/**
 * 账号注销执行任务（设计稿 docs/account-deletion-plan.md 第 7 节）
 *
 * 由 cron 任务「Execute Account Deletions」驱动，单条申请执行流程：
 *   1. 抢占：条件更新 PENDING/RUNNING/可重试 FAILED → RUNNING（并发只有一个抢到）
 *   2. 撤销全部会话：复用 cascadeUserStatusChange（refresh token 全撤 + access token
 *      黑名单 + OAuthSession 全撤 + backchannel logout + 状态 webhook 推送 "deleted"）
 *   3. 子站数据删除：POST advisor /api/internal/user-data/purge（HMAC 签名）；
 *      失败则置 FAILED 终止，主站匿名化事务未执行，等下次 cron 重试
 *   4. 事务：删 ExternalIdentity + 清微信旧列 + 匿名化 User（不物理删除——
 *      6 张财务表已改 Restrict，User 行必须保留）+ 清理 PII 衍生数据
 *   5. 收尾：申请置 COMPLETED、回执短信（fail-soft）、审计（不落明文手机号）
 *
 * 失败处理：任何步骤异常 → FAILED + lastError（attempts 在抢占时已递增）；
 * 达到 MAX_DELETION_ATTEMPTS 仍失败则 error 级告警转人工，不再自动重试。
 */
import { prisma } from "@/lib/prisma";
import { advisorRequest } from "@/lib/advisor-internal";
import { cascadeUserStatusChange } from "@/lib/user-status";
import { createAuditLog } from "@/lib/audit";
import { sendAccountDeletedNotification, sendAccountDeletionReminder } from "@/lib/sms";
import { hashIdentifier } from "@/lib/auth-security";
import { apiConsole } from "@/lib/logger";

/** 注销申请状态机：RUNNING 为执行中间态（String 字段直接写，无需迁移） */
export const DELETION_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

/** 自动重试上限：达到后保留 FAILED 转人工介入 */
export const MAX_DELETION_ATTEMPTS = 5;

/** 单次 cron 扫描的处理上限（防积压时单次运行过长） */
const DELETION_BATCH_SIZE = 50;

/** 匿名化后的占位手机号：deleted_<HMAC 前 16 位>（不可逆，登录/发码侧按格式自然拒绝） */
function anonymizedPhone(originalPhone: string): string {
  return `deleted_${hashIdentifier(originalPhone).slice(0, 16)}`;
}

export type DeletionExecuteResult = "completed" | "skipped" | "failed";

/**
 * 执行单条注销申请
 * @returns completed=已执行；skipped=未抢到（已撤回/已完成/被并发抢走）；failed=执行失败待重试/人工
 */
export async function executeAccountDeletion(requestId: string): Promise<DeletionExecuteResult> {
  const now = new Date();

  // 1. 抢占：PENDING 到期 / RUNNING 崩溃残留 / FAILED 未达重试上限 → RUNNING
  // updateMany 原子条件更新，并发执行只有一个能抢到；attempts 在抢占时递增（含重试次数语义）
  const claimed = await prisma.accountDeletionRequest.updateMany({
    where: {
      id: requestId,
      scheduledAt: { lte: now },
      OR: [
        { status: { in: [DELETION_STATUS.PENDING, DELETION_STATUS.RUNNING] } },
        { status: DELETION_STATUS.FAILED, attempts: { lt: MAX_DELETION_ATTEMPTS } },
      ],
    },
    data: { status: DELETION_STATUS.RUNNING, attempts: { increment: 1 }, lastError: null },
  });
  if (claimed.count === 0) {
    return "skipped";
  }

  try {
    const request = await prisma.accountDeletionRequest.findUnique({
      where: { id: requestId },
      select: { userId: true },
    });
    if (!request) {
      throw new Error("request_not_found");
    }
    const userId = request.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, status: true },
    });

    // 用户不存在或已是 DELETED：无可执行对象，直接收尾（幂等重入安全）
    if (!user || user.status === "DELETED") {
      await prisma.accountDeletionRequest.update({
        where: { id: requestId },
        data: { status: DELETION_STATUS.COMPLETED, completedAt: new Date() },
      });
      apiConsole.warn("[AccountDeletion] 用户不存在或已注销，申请直接置完成", { requestId, userId });
      return "completed";
    }

    const originalPhone = user.phone;

    // 2. 撤销全部会话 + access token 黑名单 + OAuthSession + backchannel logout + 状态 webhook
    // （newStatus=DELETED 走与冻结/封禁同一撤销口径）
    await cascadeUserStatusChange({ userId, previousStatus: user.status, newStatus: "DELETED" });

    // 3. 子站数据删除（主站匿名化事务之前）：失败则终止，主站数据未动，等下次 cron 重试
    const purge = await advisorRequest("/api/internal/user-data/purge", {
      method: "POST",
      query: { userId },
    });
    if (!purge.ok) {
      throw new Error(`advisor_purge_failed:${purge.code}:${purge.message}`);
    }

    // 4. 事务：解绑第三方身份 + 匿名化 User + 清理 PII 衍生数据
    // 注意：User 行只 update 不 delete（财务表 Restrict 外键 + 法定留存）
    await prisma.$transaction(async (tx) => {
      // 第三方身份全量解绑（防止注销后被第三方回调重新定位/激活）
      await tx.externalIdentity.deleteMany({ where: { userId } });
      // PII 衍生数据：密码历史、短信验证码、登录尝试（userId 维度）、收货地址簿、
      // 资料变更 webhook 失败队列（payload 含 PII 快照）、会话设备记录（IP/UA）
      await tx.passwordHistory.deleteMany({ where: { userId } });
      await tx.smsCode.deleteMany({ where: { phone: originalPhone } });
      await tx.loginAttempt.deleteMany({ where: { userId } });
      await tx.userAddress.deleteMany({ where: { userId } });
      await tx.webhookDeliveryFailure.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });

      await tx.user.update({
        where: { id: userId },
        data: {
          phone: anonymizedPhone(originalPhone),
          phoneVerified: false,
          password: null,
          nickname: null,
          avatar: null,
          birthday: null,
          gender: null,
          wechatOpenId: null,
          wechatUnionId: null,
          passwordChangedAt: null,
          passwordExpiresAt: null,
          status: "DELETED",
        },
      });
    });

    // 5. 收尾：申请置 COMPLETED + 回执短信（fail-soft）+ 审计
    await prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: { status: DELETION_STATUS.COMPLETED, completedAt: new Date() },
    });

    try {
      await sendAccountDeletedNotification(originalPhone);
    } catch (smsError) {
      // 回执短信失败不阻断（注销已完成）
      apiConsole.warn("[AccountDeletion] 回执短信发送失败:", smsError);
    }

    await createAuditLog({
      action: "account_deletion_execute",
      targetType: "user",
      targetId: userId,
      userId,
      detail: { requestId, result: "completed" },
    });

    apiConsole.info("[AccountDeletion] 注销执行完成", { requestId, userId });
    return "completed";
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const updated = await prisma.accountDeletionRequest
      .update({
        where: { id: requestId },
        data: { status: DELETION_STATUS.FAILED, lastError: message },
      })
      .catch((updateError) => {
        apiConsole.error("[AccountDeletion] 失败状态回写异常:", updateError);
        return null;
      });

    if (updated && updated.attempts >= MAX_DELETION_ATTEMPTS) {
      apiConsole.error(
        `[AccountDeletion] 申请 ${requestId} 已连续失败 ${updated.attempts} 次，转人工处理: ${message}`
      );
    } else {
      apiConsole.warn(`[AccountDeletion] 申请 ${requestId} 执行失败，待下次重试: ${message}`);
    }
    return "failed";
  }
}

/** 到期前 24 小时提醒窗口（小时级 cron 下每条约命中一次，天然去重） */
const REMINDER_WINDOW_START_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_END_MS = 25 * 60 * 60 * 1000;

/**
 * cron 入口：扫描到期申请逐个执行 + 到期前 24 小时短信提醒
 * 单条失败不影响其他申请；整体结果由调用方落 CronTaskRun
 */
export async function executeDueAccountDeletions(): Promise<{
  due: number;
  completed: number;
  failed: number;
  skipped: number;
  reminded: number;
}> {
  const now = new Date();

  const dueRequests = await prisma.accountDeletionRequest.findMany({
    where: {
      scheduledAt: { lte: now },
      OR: [
        { status: { in: [DELETION_STATUS.PENDING, DELETION_STATUS.RUNNING] } },
        { status: DELETION_STATUS.FAILED, attempts: { lt: MAX_DELETION_ATTEMPTS } },
      ],
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: DELETION_BATCH_SIZE,
  });

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of dueRequests) {
    const result = await executeAccountDeletion(r.id);
    if (result === "completed") completed += 1;
    else if (result === "failed") failed += 1;
    else skipped += 1;
  }

  // 到期前 24 小时提醒（fail-soft）：窗口 [now+24h, now+25h)，小时级 cron 每条约命中一次
  let reminded = 0;
  const upcoming = await prisma.accountDeletionRequest.findMany({
    where: {
      status: DELETION_STATUS.PENDING,
      scheduledAt: {
        gte: new Date(now.getTime() + REMINDER_WINDOW_START_MS),
        lt: new Date(now.getTime() + REMINDER_WINDOW_END_MS),
      },
    },
    select: { userId: true, scheduledAt: true },
  });
  for (const r of upcoming) {
    try {
      const owner = await prisma.user.findUnique({
        where: { id: r.userId },
        select: { phone: true },
      });
      // 跳过占位手机号（wx_）与已匿名（deleted_）账号
      if (!owner?.phone || !/^1[3-9]\d{9}$/.test(owner.phone)) continue;
      await sendAccountDeletionReminder(owner.phone, r.scheduledAt);
      reminded += 1;
    } catch (error) {
      apiConsole.warn("[AccountDeletion] 到期提醒短信发送失败:", error);
    }
  }

  return { due: dueRequests.length, completed, failed, skipped, reminded };
}

/**
 * 账号注销执行任务（设计稿 docs/account-deletion-plan.md 第 7 节）
 *
 * 由 cron 任务「Execute Account Deletions」驱动（管理端删除/人工重试亦同步调用本执行器，
 * 两条路径共享同一匿名化口径），单条申请执行流程：
 *   1. 抢占：条件更新 PENDING/RUNNING/可重试 FAILED → RUNNING（并发只有一个抢到）
 *   2. 撤销全部会话：复用 cascadeUserStatusChange（refresh token 全撤 + access token
 *      黑名单 + OAuthSession 全撤 + backchannel logout + 状态 webhook 推送 "deleted"）
 *   3. 子站数据删除：遍历 SUBSITE_PURGE_TARGETS 逐站 purge（HMAC 签名，强制绑定 query）；
 *      未配置密钥的目标 warn 级跳过；已配置目标失败则置 FAILED 终止，主站匿名化事务
 *      未执行，等下次 cron 重试
 *   4. 头像 OSS 对象清理（fail-soft：OSS 抖动不阻断注销，失败记入审计详情）
 *   5. 事务：删 ExternalIdentity + 清微信旧列 + 匿名化 User（不物理删除——
 *      6 张财务表已改 Restrict，User 行必须保留）+ 清理 PII 衍生数据
 *      （含 UserConsent 撤销、sessionsInvalidatedAt 即时失效本地校验的 JWT、
 *      兑换单快照脱敏、SpentImportRow 行内手机号匿名化）
 *   6. 收尾：申请置 COMPLETED、回执短信（fail-soft，可经 options.notifyUser 关闭）、审计
 *      （不落明文手机号）
 *
 * 失败处理：任何步骤异常 → FAILED + lastError（attempts 在抢占时已递增）；
 * 达到 MAX_DELETION_ATTEMPTS 仍失败则 error 级告警转人工，不再自动重试。
 */
import { prisma } from "@/lib/prisma";
import { purgeUserFromSubsites } from "@/lib/advisor-internal";
import { cascadeUserStatusChange } from "@/lib/user-status";
import { createAuditLog } from "@/lib/audit";
import { sendAccountDeletedNotification, sendAccountDeletionReminder } from "@/lib/sms";
import { hashIdentifier } from "@/lib/auth-security";
import { deleteOSSFiles } from "@/lib/ali-oss";
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

/**
 * 匿名化后的占位手机号：deleted_<HMAC(phone:userId) 前 16 位>（共 24 字符，
 * 在 phone 列长度内；不可逆，登录/发码侧按格式自然拒绝）。
 * 哈希输入拼接 userId：手机号可被回收复用，新用户再次注销时若仅按手机号哈希，
 * 占位值会与历史已注销用户冲突（phone 唯一约束 → P2002 → 永久 FAILED）。
 */
function anonymizedPhone(originalPhone: string, userId: string): string {
  return `deleted_${hashIdentifier(`${originalPhone}:${userId}`).slice(0, 16)}`;
}

export type DeletionExecuteResult = "completed" | "skipped" | "failed";

export interface ExecuteAccountDeletionOptions {
  /**
   * 注销完成后是否向原手机号发送回执短信（默认 true）。
   * 管理端删除路径传 false：由管理员在场/另行告知，不再触达原号码。
   */
  notifyUser?: boolean;
}

/**
 * 执行单条注销申请
 * @returns completed=已执行；skipped=未抢到（已撤回/已完成/被并发抢走）；failed=执行失败待重试/人工
 */
export async function executeAccountDeletion(
  requestId: string,
  options: ExecuteAccountDeletionOptions = {}
): Promise<DeletionExecuteResult> {
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
      select: { userId: true, phoneHash: true },
    });
    if (!request) {
      throw new Error("request_not_found");
    }
    const userId = request.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, avatar: true, status: true },
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
    const placeholderPhone = anonymizedPhone(originalPhone, userId);

    // 2. 撤销全部会话 + access token 黑名单 + OAuthSession + backchannel logout + 状态 webhook
    // （newStatus=DELETED 走与冻结/封禁同一撤销口径）
    await cascadeUserStatusChange({ userId, previousStatus: user.status, newStatus: "DELETED" });

    // 3. 子站数据删除（主站匿名化事务之前）：失败则终止，主站数据未动，等下次 cron 重试。
    // 失败详情含目标名（subsite_purge_failed:<target>:<code>），供人工队列定位故障子站。
    const purge = await purgeUserFromSubsites(userId);
    if (!purge.ok) {
      throw new Error(`subsite_purge_failed:${purge.target}:${purge.code}:${purge.message}`);
    }

    // 4. 头像 OSS 对象清理（fail-soft，与子站 purge 同理先于匿名化事务）：
    // OSS 抖动不得阻断注销权履行，失败仅告警并记入审计详情
    let avatarPurgeFailed = false;
    if (user.avatar) {
      try {
        // deleteOSSFiles 接受完整 URL 或 objectName；站内相对路径（/uploads/...）去掉前导斜杠
        const avatarRef = user.avatar.startsWith("http")
          ? user.avatar
          : user.avatar.replace(/^\/+/, "");
        await deleteOSSFiles([avatarRef]);
      } catch (ossError) {
        avatarPurgeFailed = true;
        apiConsole.warn("[AccountDeletion] 头像 OSS 删除失败（不阻断注销）:", ossError);
      }
    }

    // 5. 事务：解绑第三方身份 + 匿名化 User + 清理 PII 衍生数据
    // 注意：User 行只 update 不 delete（财务表 Restrict 外键 + 法定留存）
    await prisma.$transaction(async (tx) => {
      // 第三方身份全量解绑（防止注销后被第三方回调重新定位/激活）
      await tx.externalIdentity.deleteMany({ where: { userId } });
      // PII 衍生数据：密码历史、短信验证码、登录尝试（userId 维度）、收货地址簿、
      // 资料变更 webhook 失败队列（payload 含 PII 快照）、会话设备记录（IP/UA）
      await tx.passwordHistory.deleteMany({ where: { userId } });
      await tx.smsCode.deleteMany({ where: { phone: originalPhone } });
      // 注：SmsCode.phone 为明文列，申请时旧号码的明文行无法通过哈希匹配删除，
      // 覆盖不到的场景依赖既有 7 天过期清理（cleanupExpiredSmsCodes）兜底
      await tx.loginAttempt.deleteMany({ where: { userId } });
      // 兼容历史无 userId 的记录 + 冷静期内换绑场景：
      // 按申请时号码哈希（phoneHash，可能为空：存量申请）与执行时当前号码哈希各清一轮
      const phoneHashes = [
        ...new Set(
          [request.phoneHash, hashIdentifier(originalPhone)].filter(
            (h): h is string => typeof h === "string" && h.length > 0
          )
        ),
      ];
      await tx.loginAttempt.deleteMany({ where: { identifier: { in: phoneHashes } } });
      await tx.userAddress.deleteMany({ where: { userId } });
      await tx.webhookDeliveryFailure.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      // SSO 授权同意全量撤销（与管理端删除路径同口径）
      await tx.userConsent.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 积分兑换单：待履约的一律取消（用户已注销，不再寄送）；
      // 全部兑换单清空收货人/手机号/地址快照 PII（履约完成后快照已无留存必要）
      await tx.pointRedemption.updateMany({
        where: { userId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      await tx.pointRedemption.updateMany({
        where: { userId },
        data: { recipient: null, phone: null, address: null },
      });

      // 消费导入行内手机号匿名化：替换为与 User.phone 相同的占位值——
      // 该列语义是"行内手机号回溯"，占位值保持同用户可关联、对他人不可逆，
      // 且不破坏整批撤销等业务逻辑（撤销按 reference/amount，不依赖 phone）
      await tx.spentImportRow.updateMany({
        where: { userId },
        data: { phone: placeholderPhone },
      });
      // 注：JobApplication.phone / ContactMessage.phone 无用户关联，
      // 属独立提交的表单数据（简历投递/留言），不在账号注销清理范围内，不做处理

      await tx.user.update({
        where: { id: userId },
        data: {
          phone: placeholderPhone,
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
          // 本地校验的 JWT（access token iat 早于此时间一律拒绝）即时失效；
          // 残余限制：第三方仅凭 JWKS 验签的 sid-less OIDC token 仍存活至自然过期
          sessionsInvalidatedAt: new Date(),
          status: "DELETED",
        },
      });
    });

    // 6. 收尾：申请置 COMPLETED + 回执短信（fail-soft）+ 审计
    await prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: { status: DELETION_STATUS.COMPLETED, completedAt: new Date() },
    });

    if (options.notifyUser !== false) {
      try {
        await sendAccountDeletedNotification(originalPhone);
      } catch (smsError) {
        // 回执短信失败不阻断（注销已完成）
        apiConsole.warn("[AccountDeletion] 回执短信发送失败:", smsError);
      }
    }

    await createAuditLog({
      action: "account_deletion_execute",
      targetType: "user",
      targetId: userId,
      userId,
      detail: {
        requestId,
        result: "completed",
        // OSS 清理失败需人工补删，纳入审计留痕（不含明文手机号/URL 之外的 PII）
        ...(avatarPurgeFailed ? { avatarPurgeFailed: true } : {}),
      },
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

/**
 * 用户状态变更级联操作（共享模块）
 *
 * 供单个用户状态修改（PATCH /api/admin/users/:id）与批量修改（POST /api/admin/users）
 * 复用，保证冻结/封禁/解封的凭证撤销口径完全一致：
 * - 冻结/封禁：撤销全部 Refresh Token + access token 黑名单 + 撤销 OAuth 会话 + backchannel logout
 * - 解封：从 access token 黑名单移除
 * - 以上两种均推送 status webhook（best-effort）
 *
 * 注意：本函数只负责级联副作用，不负责更新 User.status 本身、不写审计日志；
 * 调用方应自行跳过「状态未变化」的用户（previousStatus === newStatus）。
 */
import { after } from "next/server";
import type { UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { blacklistUserTokens, removeFromBlacklist } from "@/lib/token-blacklist";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { dispatchStatusChangeWebhook, getStatusChangeWebhookTargets, toWebhookStatus } from "@/lib/webhook";
import { apiConsole } from "@/lib/logger";

/** 请求上下文内用 after()，cron/测试等非请求上下文回退为 fire-and-forget */
function runAfter(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task().catch((err) => apiConsole.warn("[UserStatus] 后台通知失败:", err));
  }
}

function buildSids(sessions: { clientId: string; sessionId: string }[]): Record<string, string> {
  const sids: Record<string, string> = {};
  for (const session of sessions) {
    if (!sids[session.clientId]) sids[session.clientId] = session.sessionId;
  }
  return sids;
}

export async function cascadeUserStatusChange(params: {
  userId: string;
  previousStatus: UserStatus;
  newStatus: UserStatus;
}): Promise<void> {
  const { userId, previousStatus, newStatus } = params;

  if (newStatus !== "ACTIVE") {
    // 撤销所有 Refresh Token + 加入 access token 黑名单，消除剩余 8 小时窗口期
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "admin_revoke" },
    });
    const reason =
      newStatus === "SUSPENDED"
        ? "账号已被临时冻结"
        : newStatus === "DELETED"
          ? "账号已注销"
          : "账号已被永久封禁";
    await blacklistUserTokens(userId, reason);

    // 撤销 OAuth 会话 + backchannel logout 通知子项目（失败不阻断主流程）
    try {
      // 撤销前先查出活跃会话的 sid，供 backchannel logout_token 携带
      const activeSessions = await prisma.oAuthSession.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { clientId: true, sessionId: true },
        orderBy: { createdAt: "desc" },
      });

      if (activeSessions.length > 0) {
        const clientIds = [...new Set(activeSessions.map((s) => s.clientId))];
        const sids: Record<string, string> = {};
        for (const s of activeSessions) {
          if (!sids[s.clientId]) sids[s.clientId] = s.sessionId;
        }
        // 撤销所有 OAuth 会话（服务端一次性清除）
        await prisma.oAuthSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        // 通过安全的 backchannel logout 通知子项目（含 URL 校验/SSRF 防护/重试）
        await sendBackchannelLogout(userId, clientIds, { includeInactive: true, sids });
      }
    } catch (err) {
      apiConsole.warn("[UserStatus] 子项目通知失败:", err);
    }
  } else {
    // 解封时从黑名单移除
    await removeFromBlacklist(userId);
  }

  // Webhook 推送账户状态变更（best-effort，不阻断主流程）
  // 状态发送 User.status 原始大写枚举（ACTIVE/SUSPENDED/BANNED），与商城侧 zod 校验对齐；
  // DELETED 经 toWebhookStatus 归入小写 "deleted" 约定
  try {
    await dispatchStatusChangeWebhook(
      {
        userId,
        oldStatus: toWebhookStatus(previousStatus),
        newStatus: toWebhookStatus(newStatus),
        source: "admin",
      },
      getStatusChangeWebhookTargets()
    );
  } catch (err) {
    apiConsole.warn("[UserStatus] Webhook 通知失败:", err);
  }
}

/**
 * ԭ�ӱ���û�״̬��
 * - ״̬���¡�sessionsInvalidatedAt��refresh token/OAuth session ������ͬһ����
 * - �����ύ�����첽���� backchannel/status webhook��
 * - ��������ʱ�� expectedStatus �� CAS�����������ɵ�״̬�ٴμ�����
 */
export async function changeUserStatus(params: {
  userId: string;
  expectedStatus: UserStatus;
  newStatus: UserStatus;
}): Promise<{ changed: boolean }> {
  const { userId, expectedStatus, newStatus } = params;
  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, status: expectedStatus },
      data:
        newStatus === "ACTIVE"
          ? { status: newStatus }
          : { status: newStatus, sessionsInvalidatedAt: now },
    });
    if (updated.count === 0) return null;

    if (newStatus === "ACTIVE") {
      return { sessions: [] as { clientId: string; sessionId: string }[] };
    }

    const sessions = await tx.oAuthSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      select: { clientId: true, sessionId: true },
      orderBy: { createdAt: "desc" },
    });

    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: "admin_revoke" },
    });
    await tx.oAuthSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });

    return { sessions };
  });

  if (!outcome) return { changed: false };

  const clientIds = [...new Set(outcome.sessions.map((s) => s.clientId))];
  runAfter(async () => {
    if (clientIds.length > 0) {
      await sendBackchannelLogout(userId, clientIds, { includeInactive: true, sids: buildSids(outcome.sessions) });
    }
    await dispatchStatusChangeWebhook(
      {
        userId,
        oldStatus: toWebhookStatus(expectedStatus),
        newStatus: toWebhookStatus(newStatus),
        source: "admin",
      },
      getStatusChangeWebhookTargets()
    );
  });

  return { changed: true };
}

/**
 * ע��/ɾ��ǰ�þ�Ĭ��ֻ�����Ự������ sessionsInvalidatedAt������״̬������״̬ webhook��
 * ���ڡ�purge ʧ��ʱ�û����� ACTIVE�������µ�¼����ע�����塣
 */
export async function quiesceUserSessions(userId: string): Promise<void> {
  const now = new Date();

  const sessions = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { sessionsInvalidatedAt: now },
    });

    const activeSessions = await tx.oAuthSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      select: { clientId: true, sessionId: true },
      orderBy: { createdAt: "desc" },
    });

    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: "account_deletion" },
    });
    await tx.oAuthSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });

    return activeSessions;
  });

  const clientIds = [...new Set(sessions.map((s) => s.clientId))];
  if (clientIds.length > 0) {
    runAfter(async () => {
      await sendBackchannelLogout(userId, clientIds, { includeInactive: true, sids: buildSids(sessions) });
    });
  }
}

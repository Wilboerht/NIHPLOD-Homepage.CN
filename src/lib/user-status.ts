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
import type { UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { blacklistUserTokens, removeFromBlacklist } from "@/lib/token-blacklist";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { dispatchStatusChangeWebhook, getStatusChangeWebhookTargets } from "@/lib/webhook";
import { apiConsole } from "@/lib/logger";

export async function cascadeUserStatusChange(params: {
  userId: string;
  previousStatus: UserStatus;
  newStatus: UserStatus;
}): Promise<void> {
  const { userId, previousStatus, newStatus } = params;

  if (newStatus !== "ACTIVE") {
    // 撤销所有 Refresh Token + 加入 access token 黑名单，消除剩余 15 分钟窗口期
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const reason = newStatus === "SUSPENDED" ? "账号已被临时冻结" : "账号已被永久封禁";
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
  // 状态发送 User.status 原始大写枚举（ACTIVE/SUSPENDED/BANNED），与商城侧 zod 校验对齐
  try {
    await dispatchStatusChangeWebhook(
      {
        userId,
        oldStatus: previousStatus,
        newStatus,
        source: "admin",
      },
      getStatusChangeWebhookTargets()
    );
  } catch (err) {
    apiConsole.warn("[UserStatus] Webhook 通知失败:", err);
  }
}

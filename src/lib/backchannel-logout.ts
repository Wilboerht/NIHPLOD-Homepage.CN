/**
 * Backchannel Logout 公共函数
 *
 * OIDC Backchannel Logout 1.0 规范实现：
 * 当用户登出或撤销授权时，通过 logout_token 非阻塞通知已注册的 RP（Relying Party）。
 *
 * 使用场景：
 * - 用户登出（POST /api/auth/logout）：通知所有活跃 OAuthSession 对应的 client
 * - 用户撤销授权（POST /api/user/oauth/revoke）：通知被撤销的单个 client
 */
import { signLogoutToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

/**
 * 向已注册的 OAuth Client 发送 Backchannel Logout 通知
 *
 * @param userId - 登出/撤销授权的用户 ID
 * @param clientIds - 需要通知的 clientId 列表（去重后查询，仅通知已配置 backchannelLogoutUri 的活跃 client）
 */
export async function sendBackchannelLogout(
  userId: string,
  clientIds: string[]
): Promise<void> {
  if (clientIds.length === 0) return;

  const uniqueClientIds = [...new Set(clientIds)];

  // 查询已注册且配置了 backchannelLogoutUri 的活跃 client
  const clients = await prisma.oAuthClient.findMany({
    where: {
      clientId: { in: uniqueClientIds },
      isActive: true,
      backchannelLogoutUri: { not: null },
    },
    select: { clientId: true, backchannelLogoutUri: true },
  });

  // 非阻塞通知：每个 client 独立处理，失败不影响其他 client
  for (const client of clients) {
    if (!client.backchannelLogoutUri) continue;

    try {
      const jti = crypto.randomUUID();
      const logoutToken = await signLogoutToken({
        sub: userId,
        aud: client.clientId,
        events: "http://schemas.openid.net/event/backchannel-logout",
        jti,
      });

      fetch(client.backchannelLogoutUri, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ logout_token: logoutToken }),
        signal: AbortSignal.timeout(5000),
      }).catch((err) => {
        apiConsole.warn(
          `[SLO] Backchannel logout 通知失败 (${client.clientId}):`,
          err
        );
      });
    } catch (err) {
      apiConsole.warn(
        `[SLO] Backchannel logout token 签发失败 (${client.clientId}):`,
        err
      );
    }
  }
}

/**
 * Back-Channel Logout Route Handler（OIDC 单点登出）
 *
 * 用户在主站全局登出 / 撤销授权时，SSO 中心会向本路由推送 logout_token，
 * SDK 校验签名与 claims 后清除本站 SSO Cookie 并回调 onLogout。
 *
 * 部署后请把本路由的公开地址（如 https://myapp.com/api/auth/backchannel-logout）
 * 登记到主站管理后台对应 Client 的 backchannelLogoutUri。
 */

import { createBackchannelLogoutRouteHandler } from "@nihplod/sso-sdk/next";

export const runtime = "nodejs";

export const POST = createBackchannelLogoutRouteHandler({
  clientId: process.env.SSO_CLIENT_ID || "your-client-id",
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  onLogout: async ({ sub, sid }) => {
    // 在这里清除本站自己的服务端会话：
    // - sub：用户唯一标识
    // - sid：SSO 会话 ID（与 access_token 的 sid claim 对应）
    // 例如：await deleteSessionBySid(sid)
    void sub;
    void sid;
  },
});

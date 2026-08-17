/**
 * OIDC RP-Initiated Logout 端点
 * GET /api/oauth/end-session
 *
 * 实现 OIDC Session Management 规范：
 * - 接收 id_token_hint（可选的 ID Token 提示）
 * - 接收 post_logout_redirect_uri（登出后返回地址）
 * - 接收 state（防 CSRF）
 * - 重定向到 /logout 页面完成主站登出
 */
import { NextRequest, NextResponse } from "next/server";
import { isTrustedPostLogoutRedirectUri } from "@/lib/post-logout-redirect";
import { verifyIdToken } from "@/lib/jwt";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "oauth-check-post-logout-uri");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
        { status: 429 }
      );
    }

    const { searchParams } = request.nextUrl;
    const idTokenHint = searchParams.get("id_token_hint");
    const postLogoutRedirectUri = searchParams.get("post_logout_redirect_uri");
    const state = searchParams.get("state");
    let clientId = searchParams.get("client_id");

    // client_id 未显式传入时，从 id_token_hint 的 aud 解析（验签失败则视为无法解析）
    if (!clientId && idTokenHint) {
      const hintClaims = await verifyIdToken(idTokenHint);
      if (hintClaims?.aud) clientId = hintClaims.aud;
    }

    // 构建主站登出 URL
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const logoutUrl = new URL("/logout", origin);

    // 透传 OIDC 参数到主站登出页
    if (clientId) {
      logoutUrl.searchParams.set("client_id", clientId);
    }
    if (postLogoutRedirectUri) {
      // 回跳地址必须能绑定到具体 client 并精确匹配其注册的 postLogoutRedirectUris；
      // client_id 缺失/无法解析或不匹配时拒绝透传（登出页兜底回首页）
      const trusted = await isTrustedPostLogoutRedirectUri(postLogoutRedirectUri, clientId);
      if (trusted) {
        logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
      } else {
        apiConsole.warn(`[EndSession] 不可信的 post_logout_redirect_uri: ${postLogoutRedirectUri}`);
      }
    }
    if (state) {
      logoutUrl.searchParams.set("state", state);
    }
    if (idTokenHint) {
      // id_token 是凭证，放 query 会进入浏览器历史与服务器日志；
      // 改放 fragment（不随请求发送、不进历史记录），由 /logout 页客户端脚本读取 location.hash
      logoutUrl.hash = new URLSearchParams({ id_token_hint: idTokenHint }).toString();
    }

    return NextResponse.redirect(logoutUrl, 302);
  } catch (error) {
    apiConsole.error("[EndSession] 异常:", error);
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    return NextResponse.redirect(new URL("/logout", origin), 302);
  }
}

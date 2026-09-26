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
import { getOAuthClientByClientId } from "@/lib/oauth-client";
import { verifyUserAuth } from "@/lib/auth";
import { revokeRefreshToken } from "@/lib/auth-security";
import { revokeAccessToken } from "@/lib/token-blacklist";
import { revokeOAuthClientSessions } from "@/lib/oauth-session-revoke";
import { logAuthEvent } from "@/lib/auth-logger";
import { prisma } from "@/lib/prisma";
import { CSRF_COOKIE_NAME } from "@/lib/csrf";
import {
  USER_COOKIE_NAME,
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_NAME,
  USER_REFRESH_COOKIE_OPTIONS,
} from "@/types/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    // 独立限流桶：identifier 加前缀与 check-post-logout-uri 端点隔离配额
    // （限流 key 为 `${type}:${identifier}`，复用同一预设的限流参数但不共享计数）
    const limitResult = await rateLimit(`end-session:${ip}`, "oauth-check-post-logout-uri");
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
    const explicitClientId = searchParams.get("client_id");
    let clientId = explicitClientId;

    // 未显式传 client_id 时从 id_token_hint 的 aud 解析；解析出的 client 必须是
    // 已注册且启用的 client（否则快速通道不生效，回落确认页，避免任意合法 hint
    // 走免确认直登出）
    if (!explicitClientId && idTokenHint) {
      const hintClaims = await verifyIdToken(idTokenHint);
      if (hintClaims?.aud && typeof hintClaims.aud === "string") {
        const audClient = await getOAuthClientByClientId(hintClaims.aud).catch(() => null);
        if (audClient?.isActive) clientId = hintClaims.aud;
      }
    }

    // ===== 快速通道：免页面、免确认，服务端直接登出后 302 直跳 =====
    // OIDC RP-Initiated Logout：id_token_hint 验签通过且 sub 与当前会话一致时，
    // 规范允许以 hint 作为发起者身份的"其他确认手段"（OP 可不再询问用户）。
    // 攻击者无法伪造"签名有效 + sub 匹配当前会话"的组合，无 hint/不匹配则回落确认页。
    // 收益：跳过 /logout 确认页与 /logout/confirm 成功页的两次整页加载与全部客户端 fetch。
    if (idTokenHint) {
      try {
        // 快速通道是无确认的敏感操作（GET + SameSite=Lax cookie，跨站顶级导航可触发），
        // hint 必须未过期：仅保留 30s 时钟偏移宽限。过期 hint 回落到下方确认页流程，
        // 由用户显式确认后登出（确认页路径允许过期 hint，仅作身份提示展示用）。
        const hintClaims = await verifyIdToken(idTokenHint, clientId ?? undefined, {
          clockToleranceSeconds: 30,
        });
        const user = await verifyUserAuth(request);
        if (hintClaims?.sub && user && hintClaims.sub === user.id) {
          // clientId 可能因上方无宽限的验签失败而为 null（hint 已过期但在 30s 宽限内），
          // 用已验签 hint 的 aud 兜底
          const effectiveClientId =
            clientId ?? (typeof hintClaims.aud === "string" ? hintClaims.aud : null);
          const trusted = postLogoutRedirectUri
            ? await isTrustedPostLogoutRedirectUri(postLogoutRedirectUri, effectiveClientId)
            : false;

          // 单设备登出，与 POST /api/auth/logout 的 allDevices=false 同口径
          const refreshToken = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;
          let sessionClientId: string | null = null;
          if (refreshToken) {
            await revokeRefreshToken(user.id, refreshToken, undefined, "logout");
            // refresh token 关联 OAuth client 时（经子站 SSO 授权建立的会话），按记录定位
            const { createHash } = await import("crypto");
            const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
            const refreshRecord = await prisma.refreshToken.findFirst({
              where: { userId: user.id, token: tokenHash },
              select: { clientId: true },
            });
            sessionClientId = refreshRecord?.clientId ?? null;
          }
          // 登出闭环：主站会话多为内部登录（refresh token clientId=null），以可信
          // clientId（显式 client_id 已经 aud 校验，或已验签 hint 的 aud）兜底撤销
          // 该 client 下的 OAuthSession 与 refresh token，并广播 backchannel logout
          const revokeClientId = sessionClientId ?? effectiveClientId;
          if (revokeClientId) {
            await revokeOAuthClientSessions(user.id, revokeClientId, { reason: "logout" });
          }
          if (user.jti) {
            await revokeAccessToken(user.jti, user.exp ? user.exp * 1000 : undefined);
          }
          logAuthEvent("user_logout", {
            userId: user.id,
            success: true,
            allDevices: false,
            ip,
            channel: "end_session_fast_path",
          });

          const target =
            trusted && postLogoutRedirectUri
              ? new URL(postLogoutRedirectUri)
              : new URL("/", process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
          if (state) target.searchParams.set("state", state);
          const res = NextResponse.redirect(target, 302);
          res.cookies.set(USER_COOKIE_NAME, "", { ...USER_ACCESS_COOKIE_OPTIONS, maxAge: 0 });
          res.cookies.set(USER_REFRESH_COOKIE_NAME, "", { ...USER_REFRESH_COOKIE_OPTIONS, maxAge: 0 });
          res.cookies.set(CSRF_COOKIE_NAME, "", {
            httpOnly: false,
            secure: true,
            sameSite: "strict",
            path: "/",
            maxAge: 0,
          });
          return res;
        }
      } catch (fastPathError) {
        // 快速通道失败不阻断登出：回落到下方 /logout 确认页流程
        apiConsole.warn("[EndSession] 快速通道异常，回落确认页流程:", fastPathError);
      }
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

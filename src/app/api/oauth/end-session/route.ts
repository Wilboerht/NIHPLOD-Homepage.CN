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
import { decodeJwt } from "jose";
import { isTrustedPostLogoutRedirectUri } from "@/lib/post-logout-redirect";
import { verifyIdToken } from "@/lib/jwt";
import { getOAuthClientByClientId } from "@/lib/oauth-client";
import { verifyUserAuth } from "@/lib/auth";
import { revokeOAuthClientSessions } from "@/lib/oauth-session-revoke";
import { logAuthEvent } from "@/lib/auth-logger";
import { recordSsoEvent } from "@/lib/sso-audit";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * 从未验签的 id_token_hint 中提取 aud，仅用于“识别发起方 client”。
 * 安全边界：该值只用于查找已注册且启用的 client，并且 post_logout_redirect_uri
 * 仍必须与该 client 注册列表精确匹配；它不会用于授予任何登录/免确认权限。
 * 这样即使 hint 已过期，标准 OIDC RP 的 post_logout_redirect_uri 也不会丢失。
 */
function redirectNoStore(url: URL | string): NextResponse {
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}

function extractAudienceUnverified(idTokenHint: string): string | null {
  try {
    const payload = decodeJwt(idTokenHint);
    const aud = payload.aud;
    if (typeof aud === "string" && aud) return aud;
    if (Array.isArray(aud)) {
      const first = aud.find((value): value is string => typeof value === "string" && !!value);
      return first ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

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
      const hintAudience =
        hintClaims?.aud && typeof hintClaims.aud === "string"
          ? hintClaims.aud
          : extractAudienceUnverified(idTokenHint);
      if (hintAudience) {
        const audClient = await getOAuthClientByClientId(hintAudience).catch(() => null);
        if (audClient?.isActive) clientId = hintAudience;
      }
    }

    // ===== 快速通道：免页面、免确认，服务端直接登出后 302 直跳 =====
    // OIDC RP-Initiated Logout：id_token_hint 验签通过、aud 绑定发起方 client_id，
    // 且 sub 与当前会话一致时，规范允许以 hint 作为发起者身份的"其他确认手段"
    //（OP 可不再询问用户）。攻击者无法伪造"签名有效 + aud 匹配 + sub 匹配当前会话"
    // 的组合；无 client_id / hint 过期 / 不匹配则回落确认页。
    // 收益：跳过 /logout 确认页与 /logout/confirm 成功页的两次整页加载与全部客户端 fetch。
    if (idTokenHint && clientId) {
      try {
        // 快速通道是无确认的敏感操作（GET + SameSite=Lax cookie，跨站顶级导航可触发），
        // hint 必须未过期：仅保留 30s 时钟偏移宽限。过期 hint 回落到下方确认页流程，
        // 由用户显式确认后登出（确认页路径允许过期 hint，仅作身份提示展示用）。
        const hintClaims = await verifyIdToken(idTokenHint, clientId, {
          clockToleranceSeconds: 30,
          requireAudience: true,
        });
        const user = await verifyUserAuth(request);
        if (hintClaims?.sub && user && hintClaims.sub === user.id) {
          const effectiveClientId = clientId;
          const trusted = postLogoutRedirectUri
            ? await isTrustedPostLogoutRedirectUri(postLogoutRedirectUri, effectiveClientId)
            : false;

          // RP 级登出免确认仅撤销发起方 client 的会话；主站会话只能经 /logout 确认页
          // 用户显式确认后由 POST /api/auth/logout 清除——否则任何持有有效 id_token 的
          // RP 都能经跨站 GET 静默踢掉用户的主站会话。
          // 有 sid 时只退出当前会话（RP-Initiated Logout 的设备级语义）；
          // 缺失 sid 的旧 token 回退为撤销该 client 全部会话（兼容旧行为）。
          const sessionSid =
            typeof hintClaims.sid === "string" && hintClaims.sid ? hintClaims.sid : undefined;
          await revokeOAuthClientSessions(
            user.id,
            effectiveClientId,
            sessionSid ? { reason: "logout", sid: sessionSid } : { reason: "logout" }
          );
          logAuthEvent("user_logout", {
            userId: user.id,
            success: true,
            allDevices: false,
            ip,
            channel: "end_session_rp_scoped",
          });
          await recordSsoEvent({
            event: "logout",
            userId: user.id,
            clientId: effectiveClientId,
            ip,
            success: true,
            detail: {
              channel: "end_session_fast_path",
              sid: sessionSid ?? null,
              allSessionsForClient: !sessionSid,
            },
          });

          // 相对路径回跳地址按本站 origin 解析（同源安全）；已注册的绝对地址不受影响
          const baseOrigin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
          const target =
            trusted && postLogoutRedirectUri
              ? new URL(postLogoutRedirectUri, baseOrigin)
              : new URL("/", baseOrigin);
          if (state) target.searchParams.set("state", state);
          return redirectNoStore(target);
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

    return redirectNoStore(logoutUrl);
  } catch (error) {
    apiConsole.error("[EndSession] 异常:", error);
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    return redirectNoStore(new URL("/logout", origin));
  }
}

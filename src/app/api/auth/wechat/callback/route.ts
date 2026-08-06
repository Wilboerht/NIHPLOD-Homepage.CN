/**
 * 微信登录回调 API
 * GET /api/auth/wechat/callback
 *
 * 返回三种情况：
 * 1. 已有账户 + 已绑定微信 → 直接登录
 * 2. 已有账户 + 未绑定微信 → 自动绑定并登录
 * 3. 完全新用户 → 返回绑定令牌，需要手动绑定
 *
 * 子站场景：授权完成后重定向到子站，并通过 URL 传递一次性 exchange token，
 * 避免 __Host- Cookie 无法跨域的问题。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, signRefreshToken } from "@/lib/jwt";
import { getWechatOAuthToken, getWechatUserInfo } from "@/lib/wechat";
import {
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_OPTIONS,
  USER_COOKIE_NAME,
  USER_REFRESH_COOKIE_NAME,
  WECHAT_NONCE_COOKIE_NAME,
  WECHAT_PLACEHOLDER_PHONE_PREFIX,
  WECHAT_NONCE_COOKIE_OPTIONS,
  WECHAT_BIND_COOKIE_NAME,
  WECHAT_BIND_COOKIE_OPTIONS,
} from "@/types/auth";
import { saveRefreshToken, extractDeviceInfo } from "@/lib/auth-security";
import { signWechatBindToken, signWechatExchangeToken } from "@/lib/jwt";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import { rateLimit } from "@/lib/ratelimit";
import { checkUserStatus } from "@/lib/auth";

// ============================================
// stateCallback 白名单校验（防开放重定向）
// ============================================

let _whitelistCache: { origins: Set<string>; ts: number } | null = null;

async function getOAuthWhitelistOrigins(): Promise<Set<string>> {
  const now = Date.now();
  if (_whitelistCache && now - _whitelistCache.ts < 60_000) return _whitelistCache.origins;
  const clients = await prisma.oAuthClient.findMany({
    where: { isActive: true },
    select: { redirectUris: true },
  });
  const origins = new Set<string>();
  for (const c of clients) {
    for (const uri of c.redirectUris) {
      try { origins.add(new URL(uri).origin); } catch { /* skip */ }
    }
  }
  _whitelistCache = { origins, ts: now };
  return origins;
}

async function resolveSafeCallback(cb: string | undefined): Promise<string> {
  const def = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
  if (!cb) return def;
  try { if (new URL(cb).origin === new URL(def).origin) return cb; } catch { return def; }
  const wl = await getOAuthWhitelistOrigins();
  try { if (wl.has(new URL(cb).origin)) return cb; } catch { return def; }
  return def;
}

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

/**
 * 构造最终重定向 URL。
 * 优先使用 state 中指定的 callback base，未指定则回退到官网默认域名。
 */
function buildRedirectUrl(stateCallback: string | undefined, redirectPath: string): string {
  const defaultBase = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
  const base = stateCallback || defaultBase;

  // 防御开放重定向：redirectPath 必须是相对路径或以 base 为根的绝对路径
  if (!redirectPath || redirectPath === "/") {
    return new URL("/", base).toString();
  }
  if (redirectPath.startsWith("//")) {
    return new URL("/", base).toString();
  }

  try {
    const resolved = new URL(redirectPath, base);
    const baseOrigin = new URL(base).origin;
    if (resolved.origin !== baseOrigin) {
      return new URL("/", base).toString();
    }
    return resolved.toString();
  } catch {
    return new URL("/", base).toString();
  }
}

/**
 * 判断 callback base 是否为子站域名。
 */
function isSubsiteCallback(callbackBase: string): boolean {
  const defaultBase = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
  try {
    return new URL(callbackBase).origin !== new URL(defaultBase).origin;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const limitResult = await rateLimit(ip, "wechat-callback");
  if (!limitResult.success) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
      { status: 429 }
    );
  }

  // 获取重定向地址（从 state 解析或默认）并校验 CSRF nonce
  let redirectUrl = "/";
  let stateCallback: string | undefined;
  let safeCallback: string = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    let loginType: "open" | "mp" = "open";
    const nonceCookie = request.cookies.get(WECHAT_NONCE_COOKIE_NAME)?.value;
    let stateValid = false;

    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
        // 校验 CSRF nonce
        if (stateData.nonce && stateData.nonce === nonceCookie) {
          stateValid = true;
          loginType = stateData.type === "mp" ? "mp" : "open";
        }
        if (stateData.redirect) {
          redirectUrl = stateData.redirect;
        }
        if (stateData.callback) {
          stateCallback = stateData.callback;
        }
      } catch {
        // state 解析失败，使用默认值
      }
    }

    // 将 stateCallback 解析为安全值（白名单校验，不在白名单中的回退默认域名）
    safeCallback = await resolveSafeCallback(stateCallback);

    // state 校验失败，拒绝处理
    if (!stateValid) {
      const targetUrl = new URL(buildRedirectUrl(safeCallback, redirectUrl));
      targetUrl.searchParams.set("wechat_auth", "error");
      targetUrl.searchParams.set("code", "INVALID_STATE");
      targetUrl.searchParams.set("message", encodeURIComponent("授权状态验证失败，请重试"));
      const response = NextResponse.redirect(targetUrl, 302);
      response.cookies.set(WECHAT_NONCE_COOKIE_NAME, "", {
        ...WECHAT_NONCE_COOKIE_OPTIONS,
        maxAge: 0,
      });
      return response;
    }

    const baseRedirectUrl = buildRedirectUrl(safeCallback, redirectUrl);

    // 用户拒绝授权
    if (error) {
      logAuthEvent("user_login", {
        success: false,
        method: "wechat",
        reason: "wechat_denied",
        ip: getClientIP(request),
      });
      const deniedUrl = new URL(baseRedirectUrl);
      deniedUrl.searchParams.set("wechat_auth", "error");
      deniedUrl.searchParams.set("code", "WECHAT_DENIED");
      deniedUrl.searchParams.set("message", encodeURIComponent("您取消了微信授权"));
      const response = NextResponse.redirect(deniedUrl, 302);
      response.cookies.set(WECHAT_NONCE_COOKIE_NAME, "", {
        ...WECHAT_NONCE_COOKIE_OPTIONS,
        maxAge: 0,
      });
      return response;
    }

    if (!code) {
      const missingCodeUrl = new URL(baseRedirectUrl);
      missingCodeUrl.searchParams.set("wechat_auth", "error");
      missingCodeUrl.searchParams.set("code", "MISSING_CODE");
      missingCodeUrl.searchParams.set("message", encodeURIComponent("缺少授权码"));
      const response = NextResponse.redirect(missingCodeUrl, 302);
      response.cookies.set(WECHAT_NONCE_COOKIE_NAME, "", {
        ...WECHAT_NONCE_COOKIE_OPTIONS,
        maxAge: 0,
      });
      return response;
    }

    // 获取 Access Token（根据 state 中的 type 选择开放平台或服务号）
    const tokenData = await getWechatOAuthToken(code, loginType);

    // 获取用户信息
    const wechatUser = await getWechatUserInfo(tokenData.accessToken, tokenData.openid);

    logAuthEvent("wechat_bind", {
      success: true,
      step: "oauth_callback",
      openid: wechatUser.openid
        ? `${wechatUser.openid.slice(0, 4)}****${wechatUser.openid.slice(-4)}`
        : undefined,
      unionid: wechatUser.unionid
        ? `${wechatUser.unionid.slice(0, 4)}****${wechatUser.unionid.slice(-4)}`
        : undefined,
      nickname: wechatUser.nickname,
      ip: getClientIP(request),
    });

    // 查找现有用户（优先通过 unionid，其次通过 openid）
    const user = await prisma.user.findFirst({
      where: wechatUser.unionid
        ? { OR: [{ wechatUnionId: wechatUser.unionid }, { wechatOpenId: wechatUser.openid }] }
        : { wechatOpenId: wechatUser.openid },
    });

    // 情况1：已有账户且已绑定微信 → 直接登录
    if (user && !user.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
      // 先校验账号状态，避免冻结/封禁用户通过微信直接登录
      const statusCheck = await checkUserStatus(user.id);
      if (!statusCheck.valid) {
        const disabledUrl = new URL(baseRedirectUrl);
        disabledUrl.searchParams.set("wechat_auth", "error");
        disabledUrl.searchParams.set("code", "WECHAT_AUTH_FAILED");
        disabledUrl.searchParams.set(
          "message",
          encodeURIComponent("您的账户暂时无法使用微信登录，请使用手机号登录或联系客服")
        );
        const response = NextResponse.redirect(disabledUrl, 302);
        response.cookies.set(WECHAT_NONCE_COOKIE_NAME, "", {
          ...WECHAT_NONCE_COOKIE_OPTIONS,
          maxAge: 0,
        });
        return response;
      }

      // 更新微信信息
      await prisma.user.update({
        where: { id: user.id },
        data: {
          wechatOpenId: wechatUser.openid,
          wechatUnionId: wechatUser.unionid || user.wechatUnionId,
          nickname: user.nickname || wechatUser.nickname || null,
          avatar: user.avatar || wechatUser.headimgurl || null,
        },
      });

      // 子站场景：通过 URL 传递一次性 exchange token，由子站完成本地 Cookie/session 写入
      if (safeCallback && isSubsiteCallback(safeCallback)) {
        const exchangeToken = await signWechatExchangeToken({
          openid: wechatUser.openid,
          unionid: wechatUser.unionid,
          nickname: wechatUser.nickname,
          avatar: wechatUser.headimgurl,
        });

        const subsiteRedirect = new URL(baseRedirectUrl);
        subsiteRedirect.searchParams.set("wechat_auth", "success");
        subsiteRedirect.searchParams.set("wechat_exchange_token", exchangeToken);

        const response = NextResponse.redirect(subsiteRedirect, 302);
        // 清除 CSRF nonce Cookie
        response.cookies.set(WECHAT_NONCE_COOKIE_NAME, "", {
          ...WECHAT_NONCE_COOKIE_OPTIONS,
          maxAge: 0,
        });
        return response;
      }

      // 官网场景：直接设置 Cookie 登录
      // 签发 Token（使用新的双 Token 机制）
      const accessToken = await signUserToken({
        id: user.id,
        phone: user.phone,
      });
      const refreshToken = await signRefreshToken({
        id: user.id,
        phone: user.phone,
      });

      logAuthEvent("user_login", {
        userId: user.id,
        identifier: user.phone,
        success: true,
        method: "wechat",
        ip: getClientIP(request),
      });

      // 保存 Refresh Token 到数据库（统一使用 saveRefreshToken，自动清理旧 Token）
      const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await saveRefreshToken(
        user.id,
        refreshToken,
        refreshTokenExpiresAt,
        extractDeviceInfo(request)
      );

      const successUrl = new URL(baseRedirectUrl);
      successUrl.searchParams.set("wechat_auth", "success");
      const response = NextResponse.redirect(successUrl, 302);

      // 设置 Access Token Cookie（15 分钟）
      response.cookies.set(USER_COOKIE_NAME, accessToken, USER_ACCESS_COOKIE_OPTIONS);
      // 设置 Refresh Token Cookie（30 天，使用统一配置 USER_REFRESH_COOKIE_OPTIONS）
      response.cookies.set(USER_REFRESH_COOKIE_NAME, refreshToken, USER_REFRESH_COOKIE_OPTIONS);
      // 清除 CSRF nonce Cookie
      response.cookies.set(WECHAT_NONCE_COOKIE_NAME, "", {
        ...WECHAT_NONCE_COOKIE_OPTIONS,
        maxAge: 0,
      });

      return response;
    }

    // 情况2：完全新用户 → 返回绑定令牌，需要手动绑定
    logAuthEvent("wechat_bind", {
      success: false,
      reason: "binding_required",
      ip: getClientIP(request),
    });

    // 子站场景：通过 URL 传递一次性 exchange token，避免 __Host- Cookie 无法跨域
    if (safeCallback && isSubsiteCallback(safeCallback)) {
        const exchangeToken = await signWechatExchangeToken({
          openid: wechatUser.openid,
          unionid: wechatUser.unionid,
          nickname: wechatUser.nickname,
          avatar: wechatUser.headimgurl,
        });

        const subsiteRedirect = new URL(baseRedirectUrl);
        subsiteRedirect.searchParams.set("wechat_auth", "binding_required");
        subsiteRedirect.searchParams.set("wechat_exchange_token", exchangeToken);

      const response = NextResponse.redirect(subsiteRedirect, 302);
      // 清除 CSRF nonce Cookie
      response.cookies.set(WECHAT_NONCE_COOKIE_NAME, "", {
        ...WECHAT_NONCE_COOKIE_OPTIONS,
        maxAge: 0,
      });
      return response;
    }

    // 官网场景：保持 Cookie 方式
    const bindToken = await signWechatBindToken({
      openid: wechatUser.openid,
      unionid: wechatUser.unionid,
      nickname: wechatUser.nickname,
      avatar: wechatUser.headimgurl,
    });

    const bindUrl = new URL(baseRedirectUrl);
    bindUrl.searchParams.set("wechat_auth", "binding_required");
    const response = NextResponse.redirect(bindUrl, 302);

    // 设置临时绑定令牌
    response.cookies.set(WECHAT_BIND_COOKIE_NAME, bindToken, WECHAT_BIND_COOKIE_OPTIONS);
    // 清除 CSRF nonce Cookie
    response.cookies.set(WECHAT_NONCE_COOKIE_NAME, "", {
      ...WECHAT_NONCE_COOKIE_OPTIONS,
      maxAge: 0,
    });

    return response;
  } catch (error) {
    apiConsole.error("[WechatCallback] 异常:", error);
    const message =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : "服务器错误";
    const fallbackUrl = new URL(buildRedirectUrl(safeCallback, redirectUrl));
    fallbackUrl.searchParams.set("wechat_auth", "error");
    fallbackUrl.searchParams.set("code", "INTERNAL_ERROR");
    fallbackUrl.searchParams.set("message", encodeURIComponent(message));
    const response = NextResponse.redirect(fallbackUrl, 302);
    response.cookies.set(WECHAT_NONCE_COOKIE_NAME, "", {
      ...WECHAT_NONCE_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return response;
  }
}

/**
 * 抖音登录回调 API
 * GET /api/auth/douyin/callback
 *
 * 返回三种情况（与微信 callback 同构）：
 * 1. 已绑定抖音的真实账户且状态正常 → 直接登录（双 Token Cookie）
 * 2. 未绑定/占位账户 → 签发绑定令牌，引导手机+验证码绑定
 * 3. 封禁/冻结 → 重定向错误页
 *
 * 多平台聚合：身份写入 ExternalIdentity（provider="douyin"），
 * 不触碰 User.wechatOpenId/wechatUnionId 微信系旧列。
 * 重定向参数复用 wechat_auth（前端 WebsiteLayoutClient 统一消费，零前端改动）。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, signRefreshToken, signWechatBindToken } from "@/lib/jwt";
import { getDouyinOAuthToken, getDouyinUserInfo } from "@/lib/douyin";
import {
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_OPTIONS,
  USER_COOKIE_NAME,
  USER_REFRESH_COOKIE_NAME,
  DOUYIN_NONCE_COOKIE_NAME,
  DOUYIN_NONCE_COOKIE_OPTIONS,
  WECHAT_PLACEHOLDER_PHONE_PREFIX,
  WECHAT_BIND_COOKIE_NAME,
  WECHAT_BIND_COOKIE_OPTIONS,
} from "@/types/auth";
import { saveRefreshToken, extractDeviceInfo } from "@/lib/auth-security";
import { findUserByIdentity, findUserByUnionId, upsertIdentity } from "@/lib/external-identity";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import { rateLimit } from "@/lib/ratelimit";
import { checkUserStatus } from "@/lib/auth";

const PROVIDER = "douyin";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

/** 清除防 CSRF nonce Cookie */
function clearNonce(response: NextResponse): void {
  response.cookies.set(DOUYIN_NONCE_COOKIE_NAME, "", {
    ...DOUYIN_NONCE_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

/** 构造错误重定向（wechat_auth 参数为前端统一消费口径） */
function errorRedirect(baseUrl: string, code: string, message: string): NextResponse {
  const url = new URL(baseUrl);
  url.searchParams.set("wechat_auth", "error");
  url.searchParams.set("code", code);
  url.searchParams.set("message", encodeURIComponent(message));
  const response = NextResponse.redirect(url, 302);
  clearNonce(response);
  return response;
}

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const limitResult = await rateLimit(ip, "douyin-callback");
  if (!limitResult.success) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
      { status: 429 }
    );
  }

  const defaultBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
  let redirectUrl = "/";

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // 解析 state 并校验防 CSRF nonce
    const nonceCookie = request.cookies.get(DOUYIN_NONCE_COOKIE_NAME)?.value;
    let stateValid = false;

    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
        if (stateData.nonce && stateData.nonce === nonceCookie) {
          stateValid = true;
        }
        if (
          typeof stateData.redirect === "string" &&
          stateData.redirect.startsWith("/") &&
          // 拒绝协议相对 URL（//evil.com）：startsWith("/") 会误放行
          !stateData.redirect.startsWith("//")
        ) {
          redirectUrl = stateData.redirect;
        }
      } catch {
        // state 解析失败，使用默认值
      }
    }

    // 防开放重定向：redirect 仅允许站内相对路径；解析后 origin 必须与官网一致（与微信 callback buildRedirectUrl 同口径）
    let baseRedirectUrl = new URL(redirectUrl || "/", defaultBaseUrl).toString();
    if (new URL(baseRedirectUrl).origin !== new URL(defaultBaseUrl).origin) {
      redirectUrl = "/";
      baseRedirectUrl = new URL("/", defaultBaseUrl).toString();
    }

    if (!stateValid) {
      return errorRedirect(baseRedirectUrl, "INVALID_STATE", "授权状态验证失败，请重试");
    }

    // 用户拒绝授权
    if (error) {
      logAuthEvent("user_login", {
        success: false,
        method: PROVIDER,
        reason: "douyin_denied",
        ip,
      });
      return errorRedirect(baseRedirectUrl, "DOUYIN_DENIED", "您取消了抖音授权");
    }

    if (!code) {
      return errorRedirect(baseRedirectUrl, "MISSING_CODE", "缺少授权码");
    }

    // code 换 access_token，再拉取用户信息
    const tokenData = await getDouyinOAuthToken(code);
    const douyinUser = await getDouyinUserInfo(tokenData.accessToken, tokenData.openId);

    logAuthEvent("wechat_bind", {
      success: true,
      step: "douyin_oauth_callback",
      openid: douyinUser.openid
        ? `${douyinUser.openid.slice(0, 4)}****${douyinUser.openid.slice(-4)}`
        : undefined,
      ip,
    });

    // 查找用户：先按本 provider 身份，再按抖音 unionid 聚合（限定 provider，避免与他系 unionid 串扰）
    let user = await findUserByIdentity(PROVIDER, douyinUser.openid);
    if (!user && douyinUser.unionid) {
      user = await findUserByUnionId(douyinUser.unionid, PROVIDER);
    }

    // 情况1：已绑定真实账户 → 直接登录
    if (user && !user.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
      const statusCheck = await checkUserStatus(user.id);
      if (!statusCheck.valid) {
        return errorRedirect(baseRedirectUrl, "DOUYIN_AUTH_FAILED", "您的账户暂时无法使用抖音登录，请使用手机号登录或联系客服");
      }

      // 更新资料缺省项 + 双写 ExternalIdentity，同事务保证一致性
      // （抖音身份不进微信系旧列，仅更新 nickname/avatar 缺省与 ExternalIdentity）
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user!.id },
          data: {
            nickname: user!.nickname || douyinUser.nickname || null,
            avatar: user!.avatar || douyinUser.avatar || null,
          },
        });
        await upsertIdentity(
          user!.id,
          PROVIDER,
          douyinUser.openid,
          douyinUser.unionid || null,
          { nickname: douyinUser.nickname ?? null, avatar: douyinUser.avatar ?? null },
          tx
        );
      });

      // 签发双 Token（access 携带 jti，登出即失效自动生效）
      const accessToken = await signUserToken({ id: user.id });
      const refreshToken = await signRefreshToken({ id: user.id });

      logAuthEvent("user_login", {
        userId: user.id,
        identifier: user.phone,
        success: true,
        method: PROVIDER,
        ip,
      });

      const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await saveRefreshToken(user.id, refreshToken, refreshTokenExpiresAt, extractDeviceInfo(request));

      const successUrl = new URL(baseRedirectUrl);
      successUrl.searchParams.set("wechat_auth", "success");
      const response = NextResponse.redirect(successUrl, 302);
      response.cookies.set(USER_COOKIE_NAME, accessToken, USER_ACCESS_COOKIE_OPTIONS);
      response.cookies.set(USER_REFRESH_COOKIE_NAME, refreshToken, USER_REFRESH_COOKIE_OPTIONS);
      clearNonce(response);
      return response;
    }

    // 情况2：未绑定/占位账户 → 返回绑定令牌，引导手机+验证码绑定
    logAuthEvent("wechat_bind", {
      success: false,
      reason: "douyin_binding_required",
      ip,
    });

    const bindToken = await signWechatBindToken({
      openid: douyinUser.openid,
      unionid: douyinUser.unionid,
      nickname: douyinUser.nickname,
      avatar: douyinUser.avatar,
      provider: PROVIDER,
    });

    const bindUrl = new URL(baseRedirectUrl);
    bindUrl.searchParams.set("wechat_auth", "binding_required");
    const response = NextResponse.redirect(bindUrl, 302);
    response.cookies.set(WECHAT_BIND_COOKIE_NAME, bindToken, WECHAT_BIND_COOKIE_OPTIONS);
    clearNonce(response);
    return response;
  } catch (error) {
    apiConsole.error("[DouyinCallback] 异常:", error);
    const message =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : "服务器错误";
    const baseUrl = new URL(redirectUrl || "/", defaultBaseUrl).toString();
    return errorRedirect(baseUrl, "INTERNAL_ERROR", message);
  }
}

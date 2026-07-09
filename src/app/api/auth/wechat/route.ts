/**
 * 获取微信登录授权 URL
 * GET /api/auth/wechat?redirect=/user&callback=https://advisor.nihplod.cn
 *
 * - redirect: 授权完成后最终重定向的页面路径（相对路径）
 * - callback: 授权完成后跳转到的站点域名（可选，用于子站场景）
 */
import { NextRequest, NextResponse } from "next/server";
import { getWechatOAuthUrl, getWechatMpOAuthUrl } from "@/lib/wechat";
import crypto from "crypto";
import { apiConsole } from "@/lib/logger";
import {
  WECHAT_NONCE_COOKIE_NAME,
  WECHAT_NONCE_COOKIE_OPTIONS,
} from "@/types/auth";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

/**
 * 校验重定向路径是否合法。
 * 只允许相对路径或同域绝对路径，防止开放重定向攻击。
 */
function isAllowedRedirect(redirect: string, baseOrigin: string): boolean {
  if (!redirect || redirect === "/") return true;
  if (redirect.startsWith("//")) return false;
  if (redirect.startsWith("/")) return true;
  try {
    return new URL(redirect).origin === baseOrigin;
  } catch {
    return false;
  }
}

/**
 * 校验 callback base URL 是否合法。
 * 只允许官网自身或已配置的子站域名，防止开放重定向攻击。
 */
function isAllowedCallbackBase(callbackBase: string): boolean {
  const allowedUrls = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_ADVISOR_URL,
    process.env.ADVISOR_SITE_URL,
  ].filter(Boolean);

  try {
    const callbackOrigin = new URL(callbackBase).origin;
    if (allowedUrls.length === 0) {
      return callbackOrigin === (process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn");
    }
    return allowedUrls.some((url) => url && new URL(url).origin === callbackOrigin);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const defaultBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";

    // 子站可通过 callback 参数指定授权完成后跳转到的域名
    const callbackParam = searchParams.get("callback");
    const callbackBase = callbackParam && isAllowedCallbackBase(callbackParam)
      ? callbackParam.replace(/\/$/, "")
      : defaultBaseUrl;

    // 校验 redirect，防止开放重定向
    const rawRedirect = searchParams.get("redirect") || "/";
    const redirect = isAllowedRedirect(rawRedirect, new URL(callbackBase).origin) ? rawRedirect : "/";

    // 微信 OAuth 回调地址固定为官网域名（由官网完成 code 换取 access_token）
    const oauthCallbackUrl = `${defaultBaseUrl}/api/auth/wechat/callback`;

    // 检测用户代理判断是否在微信内
    const userAgent = request.headers.get("user-agent") || "";
    const isWechat = userAgent.toLowerCase().includes("micromessenger");

    // 生成 CSRF nonce 并编码到 state 中
    const nonce = crypto.randomBytes(16).toString("hex");
    const type = isWechat ? "mp" : "open";
    const state = Buffer.from(JSON.stringify({ redirect, type, nonce, callback: callbackBase })).toString("base64");

    let authUrl: string;

    if (isWechat) {
      // 微信内使用公众号网页授权
      authUrl = getWechatMpOAuthUrl(oauthCallbackUrl, state, "snsapi_userinfo");
    } else {
      // PC 或其他浏览器使用开放平台扫码登录
      authUrl = getWechatOAuthUrl(oauthCallbackUrl, state);
    }

    // 判断是否显式请求 JSON（官网前端 fetch 需要 JSON）。
    // 当没有显式要求 JSON 时，默认视为浏览器直接访问，302 跳转到微信授权页。
    const mode = searchParams.get("mode");
    const acceptHeader = request.headers.get("accept") || "";
    const wantsJson = mode === "json" || acceptHeader.includes("application/json");

    // 将 nonce 写入短期 Cookie，用于回调时校验 CSRF
    if (wantsJson) {
      const response = NextResponse.json({
        success: true,
        data: {
          authUrl,
          isWechat,
        },
      });
      response.cookies.set(WECHAT_NONCE_COOKIE_NAME, nonce, WECHAT_NONCE_COOKIE_OPTIONS);
      return response;
    }

    // 浏览器直接跳转模式（子站 302 过来或用户直接打开）：直接 302 到微信授权页
    const response = NextResponse.redirect(authUrl, 302);
    response.cookies.set(WECHAT_NONCE_COOKIE_NAME, nonce, WECHAT_NONCE_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    apiConsole.error("[WechatAuth] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "服务器错误",
        },
      },
      { status: 500 }
    );
  }
}

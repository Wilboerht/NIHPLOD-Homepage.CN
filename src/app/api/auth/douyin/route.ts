/**
 * 获取抖音登录授权 URL
 * GET /api/auth/douyin?redirect=/user
 *
 * - redirect: 授权完成后最终重定向的页面路径（相对路径）
 *
 * 与微信授权入口同构：生成防 CSRF nonce 写入短期 Cookie 并编码进 state，
 * 支持 JSON 模式（前端 fetch）与 302 直跳模式（浏览器直接访问）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getDouyinOAuthUrl } from "@/lib/douyin";
import crypto from "crypto";
import { apiConsole } from "@/lib/logger";
import { DOUYIN_NONCE_COOKIE_NAME, DOUYIN_NONCE_COOKIE_OPTIONS } from "@/types/auth";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const defaultBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";

    // 校验 redirect，防止开放重定向
    const rawRedirect = searchParams.get("redirect") || "/";
    const redirect = isAllowedRedirect(rawRedirect, new URL(defaultBaseUrl).origin)
      ? rawRedirect
      : "/";

    // 抖音 OAuth 回调地址固定为官网域名（由官网完成 code 换取 access_token）
    const oauthCallbackUrl = `${defaultBaseUrl}/api/auth/douyin/callback`;

    // 生成 CSRF nonce 并编码到 state 中
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = Buffer.from(JSON.stringify({ redirect, nonce })).toString("base64url");

    const authUrl = getDouyinOAuthUrl(oauthCallbackUrl, state);

    // 判断是否显式请求 JSON（官网前端 fetch 需要 JSON）。
    // 当没有显式要求 JSON 时，默认视为浏览器直接访问，302 跳转到抖音授权页。
    const mode = searchParams.get("mode");
    const acceptHeader = request.headers.get("accept") || "";
    const wantsJson = mode === "json" || acceptHeader.includes("application/json");

    // 将 nonce 写入短期 Cookie，用于回调时校验 CSRF
    if (wantsJson) {
      const response = NextResponse.json({
        success: true,
        data: { authUrl },
      });
      response.cookies.set(DOUYIN_NONCE_COOKIE_NAME, nonce, DOUYIN_NONCE_COOKIE_OPTIONS);
      return response;
    }

    // 浏览器直接跳转模式：302 到抖音授权页
    const response = NextResponse.redirect(authUrl, 302);
    response.cookies.set(DOUYIN_NONCE_COOKIE_NAME, nonce, DOUYIN_NONCE_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    apiConsole.error("[DouyinAuth] 异常:", error);
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

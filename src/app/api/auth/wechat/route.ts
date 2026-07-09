/**
 * 获取微信登录授权 URL
 * GET /api/auth/wechat?redirect=/user
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const redirect = searchParams.get("redirect") || "/";

    // 构建回调 URL（仅使用配置的 APP_URL，防止 Host 头注入）
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
    const callbackUrl = `${baseUrl}/api/auth/wechat/callback`;

    // 检测用户代理判断是否在微信内
    const userAgent = request.headers.get("user-agent") || "";
    const isWechat = userAgent.toLowerCase().includes("micromessenger");

    // 生成 CSRF nonce 并编码到 state 中
    const nonce = crypto.randomBytes(16).toString("hex");
    const type = isWechat ? "mp" : "open";
    const state = Buffer.from(JSON.stringify({ redirect, type, nonce })).toString("base64");

    let authUrl: string;

    if (isWechat) {
      // 微信内使用公众号网页授权
      authUrl = getWechatMpOAuthUrl(callbackUrl, state, "snsapi_userinfo");
    } else {
      // PC 或其他浏览器使用开放平台扫码登录
      authUrl = getWechatOAuthUrl(callbackUrl, state);
    }

    const response = NextResponse.json({
      success: true,
      data: {
        authUrl,
        isWechat,
      },
    });

    // 将 nonce 写入短期 Cookie，用于回调时校验 CSRF
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


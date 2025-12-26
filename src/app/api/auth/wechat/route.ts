/**
 * 获取微信登录授权 URL
 * GET /api/auth/wechat?redirect=/user
 */
import { NextRequest, NextResponse } from "next/server";
import { getWechatOAuthUrl, getWechatMpOAuthUrl } from "@/lib/wechat";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const redirect = searchParams.get("redirect") || "/user";
    
    // 构建回调 URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const callbackUrl = `${baseUrl}/api/auth/wechat/callback`;
    
    // 将重定向地址编码到 state 中
    const state = Buffer.from(JSON.stringify({ redirect })).toString("base64");
    
    // 检测用户代理判断是否在微信内
    const userAgent = request.headers.get("user-agent") || "";
    const isWechat = userAgent.toLowerCase().includes("micromessenger");
    
    let authUrl: string;
    
    if (isWechat) {
      // 微信内使用公众号网页授权
      authUrl = getWechatMpOAuthUrl(callbackUrl, state, "snsapi_userinfo");
    } else {
      // PC 或其他浏览器使用开放平台扫码登录
      authUrl = getWechatOAuthUrl(callbackUrl, state);
    }

    return NextResponse.json({
      success: true,
      data: {
        authUrl,
        isWechat,
      },
    });
  } catch (error) {
    console.error("[WechatAuth] 异常:", error);
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


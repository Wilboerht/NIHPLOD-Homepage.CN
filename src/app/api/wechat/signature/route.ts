/**
 * 微信 JS-SDK 签名 API
 * GET /api/wechat/signature?url=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { getWechatSignature } from "@/lib/wechat";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

// 缓存控制: 签名有效期 2 小时，但建议每次页面加载都获取新签名
const CACHE_DURATION = 300; // 5 分钟缓存，减少重复请求

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 速率限制：每分钟最多 60 次
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 60, windowMs: 60 * 1000 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
        { status: 429 }
      );
    }

    // 获取要签名的 URL
    const url = request.nextUrl.searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_URL",
            message: "缺少 url 参数",
          },
        },
        { status: 400 }
      );
    }

    // 验证 URL 格式
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_URL",
            message: "无效的 URL 格式",
          },
        },
        { status: 400 }
      );
    }

    // 检查微信配置
    if (!process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_CONFIGURED",
            message: "微信 SDK 未配置",
          },
        },
        { status: 503 }
      );
    }

    // 域名白名单校验
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
    if (!url.startsWith(baseUrl)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_URL", message: "只能为官方域名生成签名" } },
        { status: 400 }
      );
    }

    // 获取签名
    const signature = await getWechatSignature(url);

    // 返回签名数据
    const response = NextResponse.json({
      success: true,
      data: signature,
    });

    // 添加缓存头
    response.headers.set(
      "Cache-Control",
      `public, max-age=${CACHE_DURATION}, s-maxage=${CACHE_DURATION}`
    );

    return response;
  } catch (error) {
    apiConsole.error("获取微信签名失败:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SIGNATURE_ERROR",
          message: error instanceof Error ? error.message : "获取签名失败",
        },
      },
      { status: 500 }
    );
  }
}

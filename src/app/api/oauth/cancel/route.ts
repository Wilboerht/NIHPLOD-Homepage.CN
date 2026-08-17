/**
 * OAuth 取消授权端点
 * GET /api/oauth/cancel — 用户在 SSO 登录页点击"返回"时调用。
 *
 * 登录页的返回按钮原本跳回 return_to（/api/oauth/authorize），未登录时会
 * 再次 302 回登录页造成"按钮是死的"。本端点改为按 OAuth 2.0 规范取消授权：
 * 校验 client_id / redirect_uri 归属后，302 回传 error=access_denied 到
 * 子项目回调地址，等价于用户在授权页点"取消"。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthClientByClientId } from "@/lib/oauth-client";
import { getIssuer } from "@/lib/oauth-constants";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // 限流：与 authorize 端点共用桶（每次授权流程最多触发一次 cancel）
    const limitResult = await rateLimit(ip, "oauth-authorize");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
        { status: 429 }
      );
    }

    const { searchParams } = request.nextUrl;
    const client_id = searchParams.get("client_id") || "";
    const redirect_uri = searchParams.get("redirect_uri") || "";
    const state = searchParams.get("state") || "";
    const popup_nonce = searchParams.get("popup_nonce") || "";

    // 缺少关键参数时不能安全重定向，直接返回 400
    if (!client_id || !redirect_uri) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "缺少 client_id 或 redirect_uri" },
        { status: 400 }
      );
    }

    // 参数长度限制（与 authorize 对齐）
    if (client_id.length > 128 || redirect_uri.length > 1024) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "client_id 或 redirect_uri 过长" },
        { status: 400 }
      );
    }
    if (state.length < 32 || state.length > 512) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "state 参数无效或长度不足" },
        { status: 400 }
      );
    }
    if (popup_nonce.length > 64) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "popup_nonce 参数过长" },
        { status: 400 }
      );
    }

    let redirectUrl: URL;
    try {
      redirectUrl = new URL(redirect_uri);
    } catch {
      return NextResponse.json(
        { error: "invalid_request", error_description: "redirect_uri 不是合法 URL" },
        { status: 400 }
      );
    }

    // 防开放重定向：client 必须存在且 redirect_uri 精确匹配其注册回调地址
    const client = await getOAuthClientByClientId(client_id);
    if (!client || !client.redirectUris.includes(redirect_uri)) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "client_id 或 redirect_uri 无效" },
        { status: 400 }
      );
    }

    // 构造 access_denied 回传（与 authorize 的 buildErrorRedirect 一致：附带 state + iss）
    redirectUrl.searchParams.set("error", "access_denied");
    redirectUrl.searchParams.set("error_description", "用户取消了登录");
    redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("iss", getIssuer());
    // 弹窗登录：原样透传 popup_nonce，回调页 postMessage 校验后才能关闭弹窗
    if (popup_nonce) redirectUrl.searchParams.set("popup_nonce", popup_nonce);

    scheduleSsoEvent({
      event: "authorize",
      clientId: client_id,
      clientName: client.name,
      ip,
      success: false,
      detail: { action: "cancel" },
    });

    return NextResponse.redirect(redirectUrl, 302);
  } catch (error) {
    apiConsole.error("[OAuth Cancel] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

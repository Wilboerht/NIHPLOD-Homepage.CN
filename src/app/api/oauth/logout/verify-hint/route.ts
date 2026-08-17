/**
 * id_token_hint 验证端点
 * GET /api/oauth/logout/verify-hint（兼容旧调用）
 * POST /api/oauth/logout/verify-hint（推荐：id_token_hint 放请求体，避免进入 URL/日志）
 *
 * OIDC RP-Initiated Logout：/logout 页收到 id_token_hint 后调用此端点验证。
 * - 验签 + iss/aud 校验（aud 为发起方 client_id）
 * - 与当前 SSO 会话用户比对，返回身份是否一致
 *
 * 按规范，hint 验证失败不应拒绝登出，调用方照常走用户确认流程并忽略 hint，
 * 因此本端点对非法 hint 返回 { valid: false } 而非 4xx。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, verifyUserToken } from "@/lib/jwt";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { USER_COOKIE_NAME } from "@/types/auth";

export const dynamic = "force-dynamic";

async function handleVerifyHint(
  request: NextRequest,
  idTokenHint: string | null,
  clientId: string | undefined
) {
  try {
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "oauth-check-post-logout-uri");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
        { status: 429 }
      );
    }

    if (!idTokenHint) {
      return NextResponse.json({ valid: false });
    }

    // 验签 + iss/aud 校验；失败按规范忽略 hint（valid: false）
    const claims = await verifyIdToken(idTokenHint, clientId);
    if (!claims?.sub) {
      return NextResponse.json({ valid: false });
    }

    // 与当前 SSO 会话用户比对（未登录时不做比对，仅返回验签结果）
    const userToken = request.cookies.get(USER_COOKIE_NAME)?.value;
    const sessionPayload = userToken ? await verifyUserToken(userToken) : null;

    return NextResponse.json({
      valid: true,
      matchesSession: sessionPayload ? sessionPayload.id === claims.sub : null,
    });
  } catch (error) {
    apiConsole.error("[Logout VerifyHint] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  return handleVerifyHint(
    request,
    searchParams.get("id_token_hint"),
    searchParams.get("client_id") || undefined
  );
}

export async function POST(request: NextRequest) {
  // id_token 是凭证：POST body 传递，避免经 query 进入浏览器历史/服务器日志
  let body: { id_token_hint?: string; client_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false });
  }
  return handleVerifyHint(request, body.id_token_hint ?? null, body.client_id || undefined);
}

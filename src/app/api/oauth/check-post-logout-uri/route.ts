/**
 * 校验 post_logout_redirect_uri 是否可信
 * GET /api/oauth/check-post-logout-uri?client_id=...&post_logout_redirect_uri=...
 *
 * 供 /logout 页面前端查询，避免暴露完整 redirect_uri 列表。
 */
import { NextRequest, NextResponse } from "next/server";
import { isTrustedPostLogoutRedirectUri } from "@/lib/post-logout-redirect";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const limitResult = await rateLimit(ip, "default", { maxRequests: 30, windowMs: 60 * 1000 });
  if (!limitResult.success) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429 }
    );
  }

  const { searchParams } = request.nextUrl;
  const clientId = searchParams.get("client_id");
  const uri = searchParams.get("post_logout_redirect_uri") || "";

  const trusted = await isTrustedPostLogoutRedirectUri(uri, clientId);

  return NextResponse.json({ trusted });
}

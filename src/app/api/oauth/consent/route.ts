/**
 * OAuth 用户同意端点
 * GET  /api/oauth/consent  查询当前用户隐私政策/服务条款同意状态
 * POST /api/oauth/consent  记录小程序等 OAuth 客户端的隐私政策/服务条款同意
 *
 * 与 /api/user/consent 使用同一套 PrivacyConsent 数据，区别仅在于鉴权方式：
 * 小程序持有 OAuth access token，而不是主站会话 Cookie。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { decorateOAuthResponse } from "@/lib/oauth-resource-auth";
import { getConsentStatus, recordConsent } from "@/lib/privacy-consent";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const consentSchema = z.object({
  privacy: z.boolean().refine((value) => value === true, {
    message: "请先阅读并同意隐私政策",
  }),
  terms: z.boolean().refine((value) => value === true, {
    message: "请先阅读并同意服务条款",
  }),
  marketing: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "privacy_consent_status",
    });
    if (!auth.ok) return auth.response;

    return decorateOAuthResponse(
      NextResponse.json({ success: true, data: await getConsentStatus(auth.payload.id) }),
      auth.corsHeaders
    );
  } catch (error) {
    apiConsole.error("[OAuthConsent] 查询异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "POST", {
      scope: "membership",
      action: "privacy_consent_record",
    });
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) {
      return auth.resJson(
        {
          error: "invalid_request",
          error_description: parsed.error.issues[0]?.message || "请先同意隐私政策与服务条款",
        },
        400
      );
    }

    const evidence = { source: "oauth_consent", at: new Date().toISOString() };
    await recordConsent({
      userId: auth.payload.id,
      document: "PRIVACY",
      channel: "miniprogram",
      ip: auth.ip,
      userAgent: request.headers.get("user-agent"),
      evidence,
    });
    await recordConsent({
      userId: auth.payload.id,
      document: "TERMS",
      channel: "miniprogram",
      ip: auth.ip,
      userAgent: request.headers.get("user-agent"),
      evidence,
    });
    if (parsed.data.marketing === true) {
      await recordConsent({
        userId: auth.payload.id,
        document: "MARKETING",
        channel: "miniprogram",
        ip: auth.ip,
        userAgent: request.headers.get("user-agent"),
        evidence,
      });
    }

    return decorateOAuthResponse(
      NextResponse.json({ success: true, data: await getConsentStatus(auth.payload.id) }),
      auth.corsHeaders
    );
  } catch (error) {
    apiConsole.error("[OAuthConsent] 保存异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const { getOAuthCorsHeaders } = await import("@/lib/oauth-cors");
  return new NextResponse(null, { status: 204, headers: await getOAuthCorsHeaders(request) });
}

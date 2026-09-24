/**
 * OAuth 2.0 会员数据端点
 * GET /api/oauth/membership
 *
 * 返回当前 Access Token 对应用户的会员等级、累计消费与权益配置
 * （形状同主站 GET /api/user/vip 的会员视图，共用 getMembershipView）。
 * 要求 scope 含 membership；不含 skinTestUsage（子站私有数据）。
 *
 * CORS：仅允许已注册 redirect_uri 的 origin。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { authenticateOAuthResourceRequest, isM2mPayload } from "@/lib/oauth-resource-auth";
import { getMembershipView } from "@/lib/membership-view";
import { guardOAuthUserActive } from "@/lib/oauth-user-guard";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 共享鉴权：CORS → 限流 → Bearer 提取 → token 验证 → 黑名单 → DPoP 绑定验证
    const auth = await authenticateOAuthResourceRequest(request, "GET");
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;

    // M2M token（client_credentials grant）：无用户身份，仅返回 sub
    if (isM2mPayload(payload)) {
      scheduleSsoEvent({
        event: "userinfo",
        clientId: payload.client_id,
        ip,
        success: true,
        detail: { action: "membership", type: "client_credentials" },
      });
      return resJson({ sub: payload.id });
    }

    // scope 必须含 membership
    const scopes = (payload.scope || "").split(" ").filter(Boolean);
    if (!scopes.includes("membership")) {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { action: "membership", reason: "insufficient_scope" },
      });
      return resJson(
        { error: "insufficient_scope", error_description: "需要 membership scope" },
        403,
        { "WWW-Authenticate": 'Bearer error="insufficient_scope", scope="membership"' }
      );
    }

    // 账户状态校验（与 userinfo GET/PATCH 行为对齐）：区分"不存在"(404) 与"已禁用"(403)，
    // 且非 ACTIVE 用户在 token 未过期窗口内也不得读取会员数据
    const guard = await guardOAuthUserActive(payload.id);
    if (!guard.ok) {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { action: "membership", reason: guard.reason },
      });
      return resJson({ error: guard.error, error_description: guard.errorDescription }, guard.status);
    }

    // 会员视图与主站 /api/user/vip 共用组装逻辑（不含 skinTestUsage 子站私有数据）
    const view = await getMembershipView(payload.id);
    if (!view) {
      // 防御分支：上方已确认用户存在，正常不会命中
      return resJson({ error: "not_found", error_description: "用户不存在" }, 404);
    }

    scheduleSsoEvent({
      event: "userinfo",
      userId: payload.id,
      clientId: payload.client_id,
      ip,
      success: true,
      detail: { action: "membership" },
    });

    return resJson({ sub: payload.id, ...view });
  } catch (error) {
    apiConsole.error("[OAuth Membership] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

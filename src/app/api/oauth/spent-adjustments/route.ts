/**
 * OAuth 2.0 消费补录端点
 * GET  /api/oauth/spent-adjustments - 当前用户补录申请列表
 * POST /api/oauth/spent-adjustments - 提交消费补录申请
 *
 * 数据操作与主站会话路由（/api/user/spent-adjustments）共用核心
 * （src/lib/spent-adjustment-applications.ts），校验与响应契约保持一致。
 * 要求 scope 含 membership（消费补录直接影响会员累计消费与等级）。
 *
 * CORS：仅允许已注册 redirect_uri 的 origin。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { authenticateOAuthResourceRequest, isM2mPayload } from "@/lib/oauth-resource-auth";
import {
  listSpentApplications,
  createSpentApplication,
  createSpentApplicationSchema,
} from "@/lib/spent-adjustment-applications";
import { MAX_PENDING_PER_USER } from "@/lib/spent-adjustment-meta";
import { guardOAuthUserActive } from "@/lib/oauth-user-guard";
import { rateLimit } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const REQUIRED_SCOPE = "membership";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthResourceRequest(request, "GET");
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;

    // M2M token：无用户身份，仅返回 sub
    if (isM2mPayload(payload)) {
      return resJson({ sub: payload.id });
    }

    const scopes = (payload.scope || "").split(" ").filter(Boolean);
    if (!scopes.includes(REQUIRED_SCOPE)) {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { action: "spent_adjustments", reason: "insufficient_scope" },
      });
      return resJson(
        { error: "insufficient_scope", error_description: `需要 ${REQUIRED_SCOPE} scope` },
        403,
        { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${REQUIRED_SCOPE}"` }
      );
    }

    const guard = await guardOAuthUserActive(payload.id);
    if (!guard.ok) {
      return resJson({ error: guard.error, error_description: guard.errorDescription }, guard.status);
    }

    const applications = await listSpentApplications(payload.id);
    return resJson({ success: true, data: { applications } });
  } catch (error) {
    apiConsole.error("[OAuth SpentAdjustments] 查询异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateOAuthResourceRequest(request, "POST");
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;

    if (isM2mPayload(payload)) {
      return resJson(
        { error: "invalid_request", error_description: "client_credentials token 无用户身份" },
        403
      );
    }

    const scopes = (payload.scope || "").split(" ").filter(Boolean);
    if (!scopes.includes(REQUIRED_SCOPE)) {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { action: "spent_adjustments_submit", reason: "insufficient_scope" },
      });
      return resJson(
        { error: "insufficient_scope", error_description: `需要 ${REQUIRED_SCOPE} scope` },
        403,
        { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${REQUIRED_SCOPE}"` }
      );
    }

    const guard = await guardOAuthUserActive(payload.id);
    if (!guard.ok) {
      return resJson({ error: guard.error, error_description: guard.errorDescription }, guard.status);
    }

    // 用户级提交限流（与主站会话路由同口径，防批量刷单）
    const submitLimit = await rateLimit(`user-adjust-submit:${payload.id}`, "default", {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!submitLimit.success) {
      return resJson(
        { success: false, error: { code: "RATE_LIMITED", message: "提交过于频繁，请稍后再试" } },
        429
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createSpentApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return resJson(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        400
      );
    }

    const result = await createSpentApplication({
      userId: payload.id,
      input: parsed.data,
      request,
    });

    if (!result.ok) {
      if (result.kind === "pending_limit") {
        return resJson(
          {
            success: false,
            error: {
              code: "PENDING_LIMIT",
              message: `最多同时有 ${MAX_PENDING_PER_USER} 条待审核申请，请等待审核完成后再提交`,
            },
          },
          400
        );
      }
      return resJson(
        {
          success: false,
          error: {
            code: "ORDER_NO_DUPLICATE",
            message: "该订单号已有待审核或已通过的申请，请勿重复提交",
          },
        },
        409
      );
    }

    scheduleSsoEvent({
      event: "userinfo",
      userId: payload.id,
      clientId: payload.client_id,
      ip,
      success: true,
      detail: { action: "spent_adjustments_submit", applicationId: result.application.id },
    });

    return resJson({
      success: true,
      data: {
        application: {
          id: result.application.id,
          status: result.application.status,
          statusLabel: result.application.statusLabel,
        },
      },
    });
  } catch (error) {
    apiConsole.error("[OAuth SpentAdjustments] 提交异常:", error);
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

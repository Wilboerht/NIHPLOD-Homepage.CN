/**
 * OAuth 2.0 安全中心 · 设备强制下线
 * DELETE /api/oauth/security/devices/{id} - 撤销指定设备会话
 *
 * 安全边界（与网页端一致，核心见 src/lib/security-devices.ts）：
 * - 仅能撤销本人会话（越权 404）
 * - 当前设备（当前小程序 client 最近活跃会话）不可下线（400 CURRENT_SESSION）
 * - 当前小程序的其它设备不可下线：撤销同 client 的 OAuthSession 会使当前会话立即失效
 *   （400 CURRENT_CLIENT_DEVICE）
 * - 关联 OAuth 会话同步撤销并触发 Backchannel Logout
 * 要求 scope 含 profile:write；用户级限流 10 次/小时。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { validateCUID } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { forceLogoutDevice } from "@/lib/security-devices";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "DELETE", {
      scope: "profile:write",
      action: "security_device_logout",
    });
    if (!auth.ok) return auth.response;
    const { payload, resJson } = auth;

    const limitResult = await rateLimit(`user:${payload.id}`, "default", {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limitResult.success) {
      return resJson(
        { success: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } },
        429
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return resJson(
        { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
        400
      );
    }

    const result = await forceLogoutDevice({
      userId: payload.id,
      deviceId: id,
      // OAuth 无 Cookie：null 走「当前 client 最近活跃 → 全量最近活跃」兜底
      currentRefreshTokenHash: null,
      // 禁止下线当前小程序自身的设备（撤销该 client 的 OAuthSession 会登出当前操作端）
      blockClientId: payload.client_id,
    });
    if (!result.ok) {
      return resJson(
        { success: false, error: { code: result.code, message: result.message } },
        result.status
      );
    }

    return resJson({ success: true, data: { message: "已将该设备强制下线" } });
  } catch (error) {
    apiConsole.error("[OAuth Security Device Logout] 异常:", error);
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

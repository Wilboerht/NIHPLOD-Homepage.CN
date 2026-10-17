/**
 * OAuth 2.0 安全中心 · 设备列表
 * GET /api/oauth/security/devices - 当前用户的活跃设备/会话（脱敏 IP）
 *
 * 数据核心与网页端 /api/user/devices 共用（src/lib/security-devices.ts）。
 * OAuth 场景无 Cookie：「当前设备」优先取当前小程序 client 的最近活跃会话，
 * 否则回退全量最近活跃会话。
 * 要求 scope 含 profile。
 *
 * CORS：仅允许已注册 redirect_uri 的 origin。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { listSecurityDevices } from "@/lib/security-devices";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "profile",
      action: "security_devices",
    });
    if (!auth.ok) return auth.response;

    const devices = await listSecurityDevices(auth.payload.id, null, auth.payload.client_id);
    return auth.resJson({ success: true, data: { devices } });
  } catch (error) {
    apiConsole.error("[OAuth Security Devices] 异常:", error);
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

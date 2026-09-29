/**
 * OAuth 2.0 发送"设置密码"验证码
 * POST /api/oauth/user/password/send-code
 *
 * 供子项目（BFF）代理发码：发送 type=reset 验证码到当前账号自己的手机号
 *（手机号由主站按 token 所有者解析，前端无需传参，避免枚举/串号）；
 * 与主站设置密码流程共用核心（src/lib/password-manage.ts）；scope=profile:write。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { rateLimit } from "@/lib/ratelimit";
import { sendPasswordSetCode } from "@/lib/password-manage";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "POST", {
      scope: "profile:write",
      action: "password_set_send_code",
    });
    if (!auth.ok) return auth.response;

    // 用户级限流：发短信有成本（核心内另有 60 秒间隔 / 每小时 5 次）
    const userLimit = await rateLimit(`user:${auth.payload.id}`, "default", {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!userLimit.success) {
      return auth.resJson(
        { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" } },
        429
      );
    }

    const result = await sendPasswordSetCode({
      userId: auth.payload.id,
      request,
      clientId: auth.payload.client_id,
    });

    if (!result.ok) {
      return auth.resJson(
        { success: false, error: { code: result.error.code, message: result.error.message } },
        result.error.status
      );
    }

    return auth.resJson({ success: true, data: result.data });
  } catch (error) {
    apiConsole.error("[OAuth Password] send-code 异常:", error);
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

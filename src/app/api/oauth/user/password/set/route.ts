/**
 * OAuth 2.0 首次设置密码端点
 * POST /api/oauth/user/password/set
 *
 * 供子项目（BFF）为无密码账号设置密码（短信验证码，type=reset）：
 * 与主站会话路由 /api/user/password/set 共用业务核心（src/lib/password-manage.ts）；
 * Bearer 鉴权（scope=profile:write）。成功后子站用户需重新登录。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { rateLimit } from "@/lib/ratelimit";
import { setPasswordSchema, setPassword } from "@/lib/password-manage";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "POST", {
      scope: "profile:write",
      action: "password_set",
    });
    if (!auth.ok) return auth.response;

    // 用户级限流（每用户每小时 10 次）：与主站会话路由同口径
    const userLimit = await rateLimit(`password-set:${auth.payload.id}`, "default", {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!userLimit.success) {
      return auth.resJson(
        { success: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } },
        429
      );
    }

    const body = await request.json();
    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return auth.resJson(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        400
      );
    }

    const result = await setPassword({
      userId: auth.payload.id,
      request,
      code: parsed.data.code,
      password: parsed.data.password,
      // OAuth 请求无本站 refresh Cookie：全部会话撤销（凭证变更安全口径）
      currentRefreshToken: null,
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
    apiConsole.error("[OAuth Password] 设密异常:", error);
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

/**
 * OAuth 2.0 换绑手机号 - 发送验证码
 * POST /api/oauth/phone/send-code
 *
 * 供子项目（BFF）代理发码：与主站会话路由 /api/user/phone/send-code 共用
 * 业务核心（src/lib/phone-rebind.ts）；Bearer token 即用户身份，无需 CSRF。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { rateLimit } from "@/lib/ratelimit";
import { sendRebindCodeSchema, sendPhoneRebindCode } from "@/lib/phone-rebind";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "POST", {
      scope: "phone",
      action: "phone_rebind_send_code",
    });
    if (!auth.ok) return auth.response;

    // 用户级限流：与主站会话路由同口径，防高频探测手机号是否注册（枚举）或轰炸短信
    const userLimit = await rateLimit(`user:${auth.payload.id}`, "phone-rebind");
    if (!userLimit.success) {
      return auth.resJson(
        { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" } },
        429
      );
    }

    const body = await request.json();
    const parsed = sendRebindCodeSchema.safeParse(body);
    if (!parsed.success) {
      return auth.resJson(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        400
      );
    }

    const result = await sendPhoneRebindCode({
      userId: auth.payload.id,
      ip: auth.ip,
      target: parsed.data.target,
      newPhone: parsed.data.target === "new" ? parsed.data.newPhone : undefined,
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
    apiConsole.error("[OAuth Phone] send-code 异常:", error);
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

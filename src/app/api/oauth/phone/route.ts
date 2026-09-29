/**
 * OAuth 2.0 换绑手机号端点
 * PUT /api/oauth/phone
 *
 * 供子项目（BFF）在用户中心换绑手机号：与主站会话路由 /api/user/phone 共用
 * 业务核心（src/lib/phone-rebind.ts），此处仅做 Bearer 鉴权（scope=phone）、
 * 限流与响应装饰；无浏览器 Cookie 可保留，成功后其他设备 / OAuth 会话全撤
 * 并向子站发送 backchannel logout（子站用户需重新登录）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { rateLimit } from "@/lib/ratelimit";
import { changePhoneSchema, changeUserPhone } from "@/lib/phone-rebind";
import { maskPhone } from "@/lib/mask-phone";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "PUT", {
      scope: "phone",
      action: "phone_rebind",
    });
    if (!auth.ok) return auth.response;

    // 用户级限流：与主站会话路由同口径（5 次 / 15 分钟），防验证码爆破
    const userLimit = await rateLimit(`user:${auth.payload.id}`, "phone-rebind");
    if (!userLimit.success) {
      return auth.resJson(
        { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" } },
        429
      );
    }

    const body = await request.json();
    const parsed = changePhoneSchema.safeParse(body);
    if (!parsed.success) {
      return auth.resJson(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        400
      );
    }

    const result = await changeUserPhone({
      userId: auth.payload.id,
      ip: auth.ip,
      newPhone: parsed.data.newPhone,
      currentCode: parsed.data.currentCode,
      newCode: parsed.data.newCode,
      // OAuth 请求无本站 refresh Cookie：不能定位"当前设备"，全部会话撤销（凭证变更安全口径）
      currentRefreshToken: null,
      clientId: auth.payload.client_id,
    });

    if (!result.ok) {
      return auth.resJson(
        { success: false, error: { code: result.error.code, message: result.error.message } },
        result.error.status
      );
    }

    // OAuth 通道最小化 PII：仅回传打码手机号（子站已持有用户输入的新号，无需明文回显）
    return auth.resJson({ success: true, data: { phone: maskPhone(result.data.phone) } });
  } catch (error) {
    apiConsole.error("[OAuth Phone] 换绑异常:", error);
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

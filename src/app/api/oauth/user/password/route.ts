/**
 * OAuth 2.0 修改密码端点
 * PUT /api/oauth/user/password
 *
 * 供子项目（BFF）在用户中心修改密码：与主站会话路由 /api/user/password 共用
 * 业务核心（src/lib/password-manage.ts）；Bearer 鉴权（scope=profile:write）。
 * 无浏览器 Cookie 可保留：成功后其他设备 / OAuth 会话全撤并向子站发送
 * backchannel logout（子站用户需重新登录）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { changePasswordSchema, changePassword } from "@/lib/password-manage";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "PUT", {
      scope: "profile:write",
      action: "password_change",
    });
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return auth.resJson(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        400
      );
    }

    const result = await changePassword({
      userId: auth.payload.id,
      request,
      oldPassword: parsed.data.oldPassword,
      newPassword: parsed.data.newPassword,
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

    return auth.resJson({ success: true, data: result.data });
  } catch (error) {
    apiConsole.error("[OAuth Password] 改密异常:", error);
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

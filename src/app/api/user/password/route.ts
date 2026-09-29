/**
 * 已登录用户修改密码
 * PUT /api/user/password
 *
 * 旧密码验证 + 独立防爆破（password: scope）；成功后撤销其他设备会话
 *（保留当前设备 Cookie 对应会话）、发送安全通知并失效资料缓存。
 * 业务核心见 src/lib/password-manage.ts（与 OAuth 资源端点 /api/oauth/user/password 共用）。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { changePasswordSchema, changePassword } from "@/lib/password-manage";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const PUT = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const body = await request.json();
    const result = changePasswordSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const manageResult = await changePassword({
      userId: payload.id,
      request,
      oldPassword: result.data.oldPassword,
      newPassword: result.data.newPassword,
      currentRefreshToken: request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value ?? null,
    });

    if (!manageResult.ok) {
      return NextResponse.json(
        { success: false, error: { code: manageResult.error.code, message: manageResult.error.message } },
        { status: manageResult.error.status }
      );
    }

    return NextResponse.json({ success: true, data: manageResult.data });
  } catch (error) {
    apiConsole.error("[ChangePassword] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

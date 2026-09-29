/**
 * 无密码用户设置密码（微信注册用户首次设置密码）
 * POST /api/user/password/set
 *
 * 短信验证码（type=reset）验证 + 仅限 password 为 null 的账号；
 * 设置成功后撤销其他设备会话（保留当前设备）、发送安全通知并失效资料缓存。
 * 业务核心见 src/lib/password-manage.ts（与 OAuth 资源端点 /api/oauth/user/password/set 共用）。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { rateLimit } from "@/lib/ratelimit";
import { setPasswordSchema, setPassword } from "@/lib/password-manage";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    // 用户级限流（每用户每小时 10 次）：设置密码消耗短信验证码校验资源，防滥用
    const limitResult = await rateLimit(`password-set:${payload.id}`, "default", {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const body = await request.json();
    const result = setPasswordSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const manageResult = await setPassword({
      userId: payload.id,
      request,
      code: result.data.code,
      password: result.data.password,
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
    apiConsole.error("[SetPassword] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

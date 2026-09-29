/**
 * 换绑手机号
 * PUT /api/user/phone
 *
 * 双向验证的第二步：核销当前手机号验证码（rebind-current）与
 * 新手机号验证码（rebind-new），通过后更新 User.phone。
 * 业务核心见 src/lib/phone-rebind.ts（与 OAuth 资源端点 /api/oauth/phone 共用）。
 *
 * 鉴权/CSRF/限流/响应格式为本通道（主站会话）职责；成功换绑后
 * 撤销其他设备会话（保留当前设备 Cookie 对应会话）。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { changePhoneSchema, changeUserPhone } from "@/lib/phone-rebind";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const PUT = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  // 用户级限流：防已登录用户高频探测手机号是否注册（枚举）与验证码爆破
  const userLimit = await rateLimit(`user:${payload.id}`, "phone-rebind");
  if (!userLimit.success) {
    return NextResponse.json(
      { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = changePhoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const result = await changeUserPhone({
      userId: payload.id,
      ip: getClientIP(request),
      newPhone: parsed.data.newPhone,
      currentCode: parsed.data.currentCode,
      newCode: parsed.data.newCode,
      currentRefreshToken: request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value ?? null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.error.code, message: result.error.message } },
        { status: result.error.status }
      );
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    apiConsole.error("[PhoneRebind] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

/**
 * 换绑手机号 - 发送验证码
 * POST /api/user/phone/send-code
 *
 * 双向验证的第一步：target=current 向当前手机号发码（验证身份）；
 * target=new 向新手机号发码（验证新号码所有权）。
 * 业务核心见 src/lib/phone-rebind.ts（与 OAuth 资源端点 /api/oauth/phone/send-code 共用）。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { rateLimit, getClientIP as getRateLimitClientIP } from "@/lib/ratelimit";
import { getClientIP } from "@/lib/client-ip";
import { sendRebindCodeSchema, sendPhoneRebindCode } from "@/lib/phone-rebind";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  // 用户级限流：防止已登录用户高频探测手机号是否注册（枚举）或轰炸短信
  const userLimit = await rateLimit(`user:${payload.id}`, "phone-rebind");
  if (!userLimit.success) {
    return NextResponse.json(
      { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }

  // IP 频率限制（防短信轰炸）
  const ip = getRateLimitClientIP(request);
  const ipLimit = await rateLimit(ip, "form");
  if (!ipLimit.success) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "TOO_MANY_REQUESTS", message: "请求过于频繁，请稍后再试" },
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = sendRebindCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const result = await sendPhoneRebindCode({
      userId: payload.id,
      ip: getClientIP(request),
      target: parsed.data.target,
      newPhone: parsed.data.target === "new" ? parsed.data.newPhone : undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.error.code, message: result.error.message } },
        { status: result.error.status }
      );
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    apiConsole.error("[PhoneRebind] send-code 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

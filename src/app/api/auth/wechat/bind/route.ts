import { NextRequest, NextResponse } from "next/server";
import {
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_OPTIONS,
  USER_COOKIE_NAME,
  USER_REFRESH_COOKIE_NAME,
  WECHAT_BIND_COOKIE_NAME,
  WECHAT_BIND_COOKIE_OPTIONS,
} from "@/types/auth";
import { z } from "zod";
import { passwordSchema } from "@/lib/password";
import { verifyWechatBindToken } from "@/lib/jwt";
import { resolveWechatBinding } from "@/lib/wechat-binding";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { rateLimit } from "@/lib/ratelimit";

/**
 * 微信绑定表单
 * 密码现在是可选的（如果不提供，会自动生成）
 * bindToken：可选，小程序等无 Cookie 环境通过 body 传递（优先于 Cookie）
 * provider：可选，外部身份归属标识（小程序传 wechat_miniprogram），限定枚举防任意值；
 *   未传时回退 bindToken 载荷中的 provider（签发入口已知平台），最终默认 wechat_open
 */
const bindSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  code: z.string().length(6, "验证码为6位数字"),
  password: passwordSchema.optional(),
  allowAutoPassword: z.boolean().default(false),
  bindToken: z.string().max(4096).optional(),
  provider: z.enum(["wechat_open", "wechat_mp", "wechat_miniprogram"]).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // IP 速率限制（防爆破）
  const clientIP = getClientIP(request);
  const ipLimit = await rateLimit(clientIP, "wechat-bind");
  if (!ipLimit.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "请求过于频繁，请稍后再试",
        },
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();

    const result = bindSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: result.error.issues[0]?.message,
          },
        },
        { status: 400 }
      );
    }

    // CSRF 校验：body 携带 bindToken 的非浏览器通道（小程序等）无 Cookie，无法双端比对，予以豁免；
    // 浏览器 Cookie 通道保持强制校验。豁免安全性：绑定必须通过 SMS 验证码（攻击者无法获取），
    // 且 bindToken 为服务端签名 JWT，不可伪造。
    if (!result.data.bindToken && !validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const { phone, code, password, allowAutoPassword, provider } = result.data;

    // body 中的 bindToken 优先（小程序等无 Cookie 环境），其次读 Cookie（官网浏览器场景）
    const bindToken = result.data.bindToken || request.cookies.get(WECHAT_BIND_COOKIE_NAME)?.value;
    if (!bindToken) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "BIND_TOKEN_EXPIRED",
            message: "微信授权已过期，请重新扫码",
          },
        },
        { status: 400 }
      );
    }

    // 验证绑定 token
    const wechatInfo = await verifyWechatBindToken(bindToken);
    if (!wechatInfo) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_BIND_TOKEN",
            message: "微信授权无效或已过期，请重新扫码",
          },
        },
        { status: 400 }
      );
    }

    const bindingResult = await resolveWechatBinding({
      phone,
      code,
      password,
      allowAutoPassword,
      wechatInfo,
      request,
      // provider 优先级：body 显式指定 > bindToken 载荷（签发入口已知平台）> 默认 wechat_open
      provider:
        provider ||
        (wechatInfo.type === "wechat_bind" ? wechatInfo.provider : undefined),
    });

    if (!bindingResult.success) {
      return NextResponse.json(
        { success: false, error: { code: bindingResult.code, message: bindingResult.message } },
        { status: bindingResult.code === "ACCOUNT_DISABLED" ? 403 : 400 }
      );
    }

    const { user, accessToken, refreshToken, passwordGenerated, message } = bindingResult.data;

    const response = NextResponse.json({
      success: true,
      data: {
        user,
        message,
        passwordGenerated,
      },
    });

    // 设置 Access Token Cookie（15 分钟）
    response.cookies.set(USER_COOKIE_NAME, accessToken, USER_ACCESS_COOKIE_OPTIONS);
    // 设置 Refresh Token Cookie（30 天，使用统一配置 USER_REFRESH_COOKIE_OPTIONS）
    response.cookies.set(USER_REFRESH_COOKIE_NAME, refreshToken, USER_REFRESH_COOKIE_OPTIONS);
    // 清除临时绑定 token
    response.cookies.set(WECHAT_BIND_COOKIE_NAME, "", { ...WECHAT_BIND_COOKIE_OPTIONS, maxAge: 0 });

    logAuthEvent("wechat_bind", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      ip: getClientIP(request),
    });

    return response;
  } catch (error) {
    apiConsole.error("[WechatBind] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务器内部错误",
        },
      },
      { status: 500 }
    );
  }
}

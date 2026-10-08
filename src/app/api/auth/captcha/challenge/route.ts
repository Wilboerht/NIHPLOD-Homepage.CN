/**
 * PoW 人机验证挑战签发 API
 * POST /api/auth/captcha/challenge
 *
 * 客户端领取挑战后在本地求解（见 lib/captcha-client.ts），
 * 解出的 token 随 send-code / login-password 请求提交，一次性有效。
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createCaptchaChallenge } from "@/lib/captcha";
import { apiConsole } from "@/lib/logger";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // IP 频率限制：挑战本身廉价，但签发会写库，防 DB 行洪泛
  const ip = getClientIP(request);
  const limit = await rateLimit(ip, "captcha");
  if (!limit.success) {
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

  // 双提交校验：调用方只有官网登录页（apiPost 自动附带 CSRF token）
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const challenge = await createCaptchaChallenge();
    return NextResponse.json({ success: true, data: challenge });
  } catch (error) {
    apiConsole.error("[Captcha] 签发挑战异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务器错误",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * 手机号验证码登录 API（仅登录，不自动注册）
 * POST /api/auth/login
 *
 * 安全增强：
 * - 请求速率限制
 * - 账户防爆破保护（失败5次后锁定30分钟）
 * - 登录失败记录
 * - 双Token机制（Access Token + Refresh Token）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, signRefreshToken } from "@/lib/jwt";
import {
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_OPTIONS,
  USER_COOKIE_NAME,
  USER_REFRESH_COOKIE_NAME,
} from "@/types/auth";
import {
  checkAccountLockout,
  recordLoginAttempt,
  saveRefreshToken,
  clearLoginAttempts,
  extractDeviceInfo,
} from "@/lib/auth-security";
import { rateLimit, getClientIP as getRateLimitClientIP } from "@/lib/ratelimit";
import { verifyCode } from "@/lib/sms";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { z } from "zod";

// 请求参数验证
const loginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  code: z.string().length(6, "验证码为6位数字"),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. 项目级速率限制（防止滥用，在 body 解析之前，避免大 payload 绕过限流）
  const clientIP = getRateLimitClientIP(request);
  const ipLimit = await rateLimit(clientIP, "login");
  if (!ipLimit.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "登录尝试过于频繁，请稍后再试",
        },
      },
      { status: 429 }
    );
  }

  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const body = await request.json();

    // 参数验证
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: result.error.issues[0]?.message || "参数错误",
          },
        },
        { status: 400 }
      );
    }

    const { phone, code } = result.data;

    // 2. 检查账户是否被锁定（防爆破）
    const { locked, remainingMinutes } = await checkAccountLockout(phone);
    if (locked) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_LOCKED",
            message: `账户已被锁定，请在 ${remainingMinutes} 分钟后重试`,
          },
        },
        { status: 429 }
      );
    }

    // 3. 查找验证码
    const smsCode = await prisma.smsCode.findFirst({
      where: {
        phone,
        type: "login",
        used: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!smsCode) {
      // 记录失败尝试
      await recordLoginAttempt(phone, false, request, "code_expired", "sms");

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CODE_EXPIRED",
            message: "验证码已过期或不存在",
          },
        },
        { status: 400 }
      );
    }

    // 4. 验证码校验
    if (!verifyCode(phone, code, "login", smsCode.codeHash)) {
      // 记录失败尝试
      await recordLoginAttempt(phone, false, request, "code_invalid", "sms");

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CODE_INVALID",
            message: "验证码错误",
          },
        },
        { status: 400 }
      );
    }

    // 原子核销验证码（updateMany + used:false 防止并发重用）
    const consumeResult = await prisma.smsCode.updateMany({
      where: { id: smsCode.id, used: false },
      data: { used: true },
    });
    if (consumeResult.count === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CODE_EXPIRED",
            message: "验证码已过期或已被使用",
          },
        },
        { status: 400 }
      );
    }

    // 5. 查找用户（验证码登录不再自动注册，用户必须先通过 /api/auth/register 注册）
    const user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      // 记录失败尝试
      await recordLoginAttempt(phone, false, request, "user_not_found", "sms");

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "该手机号未注册，请先注册账户",
          },
        },
        { status: 400 }
      );
    }

    // 5.1 检查账号状态
    if (user.status !== "ACTIVE") {
      const statusText = user.status === "SUSPENDED" ? "已被临时冻结" : "已被永久封禁";
      await recordLoginAttempt(
        phone,
        false,
        request,
        `account_${user.status.toLowerCase()}`,
        "sms"
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_DISABLED",
            message: `账号${statusText}，请联系客服`,
          },
        },
        { status: 403 }
      );
    }

    // 6. 更新手机验证状态
    if (!user.phoneVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true },
      });
    }

    // 7. 记录成功登录
    await recordLoginAttempt(phone, true, request, undefined, "sms", user.id);

    // 8. 清除当前类型的失败登录记录（成功登录后重置）
    await clearLoginAttempts(phone, "sms");

    // 9. 签发 Access Token（短期，15分钟）
    const accessToken = await signUserToken({
      id: user.id,
      phone: user.phone,
    });

    // 10. 签发 Refresh Token（长期，30天）
    const refreshToken = await signRefreshToken({
      id: user.id,
      phone: user.phone,
    });

    // 11. 保存 Refresh Token 到数据库
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await saveRefreshToken(
      user.id,
      refreshToken,
      refreshTokenExpiresAt,
      extractDeviceInfo(request)
    );

    // 12. 构建响应
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
        },
      },
    });

    // 13. 设置 Cookies
    // Access Token: 15 分钟，与 JWT 过期一致
    response.cookies.set(USER_COOKIE_NAME, accessToken, USER_ACCESS_COOKIE_OPTIONS);
    // Refresh Token: 30 天（使用统一配置 USER_REFRESH_COOKIE_OPTIONS）
    response.cookies.set(USER_REFRESH_COOKIE_NAME, refreshToken, USER_REFRESH_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    apiConsole.error("[Login] 异常:", error);
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

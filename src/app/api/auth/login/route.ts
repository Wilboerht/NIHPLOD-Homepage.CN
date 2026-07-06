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
import { signUserToken, signRefreshToken, getTokenExpiresAt, getRefreshTokenExpiresAt } from "@/lib/jwt";
import {
  USER_ACCESS_COOKIE_OPTIONS,
  USER_COOKIE_NAME,
  USER_REFRESH_COOKIE_NAME,
} from "@/types/auth";
import {
  checkAccountLockout,
  recordLoginAttempt,
  saveRefreshToken,
  clearLoginAttempts,
} from "@/lib/auth-security";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

// 请求参数验证
const loginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  code: z.string().length(6, "验证码为6位数字"),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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

    // 1. 项目级速率限制（防止滥用）
    const clientIP = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
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
    if (smsCode.code !== code) {
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

    // 标记验证码已使用
    await prisma.smsCode.update({
      where: { id: smsCode.id },
      data: { used: true },
    });

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

    // 6. 更新手机验证状态
    if (!user.phoneVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true },
      });
    }

    // 7. 记录成功登录
    await recordLoginAttempt(phone, true, request, undefined, "sms");

    // 8. 清除失败登录记录（成功登录后重置）
    await clearLoginAttempts(phone);

    if (process.env.NODE_ENV === "development") console.log(`[Login] 用户登录成功: ${phone.slice(0, 3)}****${phone.slice(-4)}`);

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
    const refreshTokenExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    );
    await saveRefreshToken(user.id, refreshToken, refreshTokenExpiresAt);

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
        accessTokenExpiresAt: getTokenExpiresAt(15), // 15分钟
        refreshTokenExpiresAt: getRefreshTokenExpiresAt(), // 30天
      },
    });

    // 13. 设置 Cookies
    // Access Token: 15 分钟，与 JWT 过期一致
    response.cookies.set(USER_COOKIE_NAME, accessToken, USER_ACCESS_COOKIE_OPTIONS);
    // Refresh Token: 30 天
    response.cookies.set(USER_REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

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


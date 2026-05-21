/**
 * 手机号+密码登录 API
 * POST /api/auth/login-password
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
import { verifyPassword } from "@/lib/password";
import { USER_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";
import {
  checkAccountLockout,
  recordLoginAttempt,
  saveRefreshToken,
  clearLoginAttempts,
} from "@/lib/auth-security";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

// 请求参数验证
const loginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  password: z.string().min(6, "密码至少6位").max(32, "密码最多32位"),
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

    const { phone, password } = result.data;

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

    // 3. 查找用户
    const user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      // 记录失败尝试
      await recordLoginAttempt(phone, false, request, "user_not_found", "password");

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "用户不存在，请先注册",
          },
        },
        { status: 400 }
      );
    }

    // 4. 检查是否设置了密码
    if (!user.password) {
      // 记录失败尝试
      await recordLoginAttempt(phone, false, request, "password_not_set", "password");

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PASSWORD_NOT_SET",
            message: "该账号未设置密码，请使用验证码登录后设置密码",
          },
        },
        { status: 400 }
      );
    }

    // 5. 验证密码
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      // 记录失败尝试
      await recordLoginAttempt(phone, false, request, "password_incorrect", "password");

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PASSWORD_INCORRECT",
            message: "密码错误",
          },
        },
        { status: 400 }
      );
    }

    // 6. 记录成功登录
    await recordLoginAttempt(phone, true, request, undefined, "password");

    // 7. 清除失败登录记录（成功登录后重置）
    await clearLoginAttempts(phone);

    // 8. 签发 Access Token（短期，15分钟）
    const accessToken = await signUserToken({
      id: user.id,
      phone: user.phone,
    });

    // 9. 签发 Refresh Token（长期，30天）
    const refreshToken = await signRefreshToken({
      id: user.id,
      phone: user.phone,
    });

    // 10. 保存 Refresh Token 到数据库
    const refreshTokenExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    );
    await saveRefreshToken(user.id, refreshToken, refreshTokenExpiresAt);

    if (process.env.NODE_ENV === "development") console.log(`[LoginPassword] 用户登录成功: ${phone.slice(0, 3)}****${phone.slice(-4)}`);

    // 11. 构建响应
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

    // 12. 设置 Cookies
    response.cookies.set(USER_COOKIE_NAME, accessToken, USER_COOKIE_OPTIONS);
    response.cookies.set("user_refresh_token", refreshToken, {
      ...USER_COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60, // 30天
    });

    return response;
  } catch (error) {
    console.error("[LoginPassword] 异常:", error);
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


/**
 * 用户注册 API
 * POST /api/auth/register
 * 
 * 安全增强：
 * - 请求速率限制（防垃圾注册）
 * - 双Token机制（Access Token + Refresh Token）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, signRefreshToken, getTokenExpiresAt, getRefreshTokenExpiresAt } from "@/lib/jwt";
import { USER_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";
import { saveRefreshToken } from "@/lib/auth-security";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";
import { hashPassword, passwordSchema } from "@/lib/password";
import { apiConsole } from "@/lib/logger";

// 请求参数验证
const registerSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  code: z.string().length(6, "验证码为6位数字"),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. 项目级速率限制（防止垃圾注册）
    const clientIP = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
    const ipLimit = await rateLimit(clientIP, "form");
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

    const body = await request.json();

    // 2. 参数验证
    const result = registerSchema.safeParse(body);
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

    const { phone, code, password } = result.data;

    // 检查手机号是否已注册
    const existingUser = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PHONE_EXISTS",
            message: "该手机号已注册，请直接登录",
          },
        },
        { status: 400 }
      );
    }

    // 查找验证码
    const smsCode = await prisma.smsCode.findFirst({
      where: {
        phone,
        type: "register",
        used: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!smsCode) {
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

    // 验证码校验
    if (smsCode.code !== code) {
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

    // 加密密码（使用项目统一的 salt rounds）
    const hashedPassword = await hashPassword(password);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        phone,
        phoneVerified: true,
        password: hashedPassword,
      },
    });

    if (process.env.NODE_ENV === "development") console.log(`[Register] 新用户注册: ${phone.slice(0, 3)}****${phone.slice(-4)}`);

    // 3. 签发 Access Token（短期，15分钟）
    const accessToken = await signUserToken({
      id: user.id,
      phone: user.phone,
    });

    // 4. 签发 Refresh Token（长期，30天）
    const refreshToken = await signRefreshToken({
      id: user.id,
      phone: user.phone,
    });

    // 5. 保存 Refresh Token 到数据库
    const refreshTokenExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    );
    await saveRefreshToken(user.id, refreshToken, refreshTokenExpiresAt);

    // 6. 构建响应
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
        },
        isNewUser: true,
        accessTokenExpiresAt: getTokenExpiresAt(15), // 15分钟
        refreshTokenExpiresAt: getRefreshTokenExpiresAt(), // 30天
      },
    });

    // 7. 设置 Cookies
    response.cookies.set(USER_COOKIE_NAME, accessToken, USER_COOKIE_OPTIONS);
    response.cookies.set("user_refresh_token", refreshToken, {
      ...USER_COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60, // 30天
    });

    return response;
  } catch (error) {
    apiConsole.error("[Register] 异常:", error);
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


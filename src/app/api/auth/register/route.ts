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
import { signUserToken, signRefreshToken } from "@/lib/jwt";
import {
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_OPTIONS,
  USER_COOKIE_NAME,
  USER_REFRESH_COOKIE_NAME,
} from "@/types/auth";
import { saveRefreshToken, extractDeviceInfo, recordLoginAttempt } from "@/lib/auth-security";
import { rateLimit, getClientIP as getRateLimitClientIP } from "@/lib/ratelimit";
import { getClientIP } from "@/lib/client-ip";
import { logAuthEvent } from "@/lib/auth-logger";
import { z } from "zod";
import { hashPassword, passwordSchema, getPasswordExpiryDate } from "@/lib/password";
import { verifyCode } from "@/lib/sms";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { recordPasswordHistory } from "@/lib/password-policy";

// 请求参数验证
const registerSchema = z
  .object({
    name: z.string().trim().min(1, "请输入姓名").max(30, "姓名最多30个字符").optional(),
    phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
    code: z.string().regex(/^\d{6}$/, "验证码为6位数字"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  });

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. 项目级速率限制（防止垃圾注册）
  const clientIP = getRateLimitClientIP(request);
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

  try {
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
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

    const { name, phone, code, password } = result.data;

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

    // 验证码校验
    if (!verifyCode(phone, code, "register", smsCode.codeHash)) {
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
      await recordLoginAttempt(phone, false, request, "code_already_used", "sms");
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

    // 加密密码（使用项目统一的 salt rounds）
    const hashedPassword = await hashPassword(password);

    // 在事务中完成：检查手机号 → 创建用户 → 记录密码历史
    // 防止并发请求绕过手机号重复检查
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { phone } });
        if (existing) {
          return null; // 手机号已存在
        }
        return tx.user.create({
          data: {
            phone,
            phoneVerified: true,
            password: hashedPassword,
            passwordChangedAt: new Date(),
            passwordExpiresAt: getPasswordExpiryDate(),
            ...(name ? { nickname: name } : {}),
          },
        });
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "P2002"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PHONE_EXISTS",
              message: "该手机号已注册，请直接登录",
            },
          },
          { status: 409 }
        );
      }
      throw error;
    }

    if (!user) {
      await recordLoginAttempt(phone, false, request, "phone_exists", "sms");
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

    // 记录初始密码历史
    await recordPasswordHistory(user.id, hashedPassword);

    logAuthEvent("user_register", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      ip: getClientIP(request),
    });

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
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await saveRefreshToken(
      user.id,
      refreshToken,
      refreshTokenExpiresAt,
      extractDeviceInfo(request)
    );

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
      },
    });

    // 7. 设置 Cookies
    response.cookies.set(USER_COOKIE_NAME, accessToken, USER_ACCESS_COOKIE_OPTIONS);
    response.cookies.set(USER_REFRESH_COOKIE_NAME, refreshToken, USER_REFRESH_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    apiConsole.error("[Register] 异常:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      // 事务内未捕获的 P2002（旧版 saveRefreshToken 可能触发）
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PHONE_EXISTS",
            message: "该手机号已注册，请直接登录",
          },
        },
        { status: 409 }
      );
    }
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

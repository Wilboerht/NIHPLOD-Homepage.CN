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
import {
  saveRefreshToken,
  extractDeviceInfo,
  recordLoginAttempt,
  checkAccountLockout,
  clearLoginAttempts,
} from "@/lib/auth-security";
import { rateLimit, getClientIP as getRateLimitClientIP } from "@/lib/ratelimit";
import { getClientIP } from "@/lib/client-ip";
import { logAuthEvent } from "@/lib/auth-logger";
import { z } from "zod";
import { hashPassword, passwordSchema, getPasswordExpiryDate } from "@/lib/password";
import { verifyCode, recordSmsCodeFailure, SMS_CODE_MAX_ATTEMPTS } from "@/lib/sms";
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

    // 账户级防爆破：与 login/reset-password 保持一致（验证码闸门之外的补充防线）
    const { locked, remainingMinutes } = await checkAccountLockout(phone);
    if (locked) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_LOCKED",
            message: `操作过于频繁，请在 ${remainingMinutes} 分钟后重试`,
          },
        },
        { status: 429 }
      );
    }

    // 手机号查重前置：已注册号码在验证码核销之前短路返回，避免白烧验证码
    // （事务内 findUnique + P2002 兜底仍保留，防并发双注册）
    const existingUser = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
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
        { status: 409 }
      );
    }

    // 查找验证码
    // attempts 上限兜底：达到 SMS_CODE_MAX_ATTEMPTS 的码视同无效（正常已被作废标记 used）
    const smsCode = await prisma.smsCode.findFirst({
      where: {
        phone,
        type: "register",
        used: false,
        attempts: { lt: SMS_CODE_MAX_ATTEMPTS },
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    // IP 绑定校验（核销之前执行，失败不烧码）：验证码使用 IP 需与发送 IP 一致（可配置）
    if (smsCode && process.env.SMS_VERIFY_IP_BIND === "true" && smsCode.ipAddress) {
      const verifyIp = getRateLimitClientIP(request);
      if (verifyIp !== smsCode.ipAddress) {
        apiConsole.warn(
          `[Register] IP 不匹配: 发送IP=${smsCode.ipAddress}, 校验IP=${verifyIp}, 手机=${phone}`
        );
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "IP_MISMATCH",
              message: "验证环境异常，请重新获取验证码",
            },
          },
          { status: 400 }
        );
      }
    }

    // 反枚举："无可用码"与"码不匹配"统一返回同一错误码（配合 send-code 假发送）
    // 验证码类失败不计入账户锁定池：否则攻击者无需任何验证码即可锁住任意手机号。
    // 防爆破由单码失败计数承担：码不匹配时递增 attempts，达到上限自动作废该验证码。
    if (!smsCode) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CODE_INVALID",
            message: "验证码错误或已过期",
          },
        },
        { status: 400 }
      );
    }
    if (!verifyCode(phone, code, "register", smsCode.codeHash)) {
      await recordSmsCodeFailure(smsCode.id);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CODE_INVALID",
            message: "验证码错误或已过期",
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
            code: "CODE_INVALID",
            message: "验证码错误或已过期",
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
      // 并发场景下事务内查重命中：不计入锁定池（非凭据失败）
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

    // 记录成功注册并清除失败记录（与 login 一致）
    await recordLoginAttempt(phone, true, request, undefined, "sms", user.id);
    await clearLoginAttempts(phone, "sms");

    logAuthEvent("user_register", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      ip: getClientIP(request),
    });

    // 3. 签发 Access Token（短期，15分钟）
    const accessToken = await signUserToken({
      id: user.id,
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

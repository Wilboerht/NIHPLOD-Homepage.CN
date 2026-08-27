/**
 * 重置密码 API
 * POST /api/auth/reset-password
 * 通过短信验证码重置密码（忘记密码场景）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { passwordSchema } from "@/lib/password";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import { rateLimit, getClientIP as getRateLimitClientIP } from "@/lib/ratelimit";
import { checkAccountLockout, recordLoginAttempt, clearLoginAttempts } from "@/lib/auth-security";
import { checkUserStatus } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import {
  verifyCode,
  recordSmsCodeFailure,
  sendPasswordChangedNotification,
  SMS_CODE_MAX_ATTEMPTS,
} from "@/lib/sms";
import { updateUserPassword } from "@/lib/password-policy";

// 请求参数验证
const resetPasswordSchema = z
  .object({
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
  // IP 速率限制：必须在 CSRF 检查之前，防止攻击者通过不带 CSRF token 的请求绕过限流
  const ip = getClientIP(request);
  const ipLimit = await rateLimit(ip, "reset-password", {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!ipLimit.success) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "RATE_LIMITED", message: "请求过于频繁，请 15 分钟后再试" },
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
    const result = resetPasswordSchema.safeParse(body);
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

    // 1. 账户级防爆破检查
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

    // 验证验证码
    // attempts 上限兜底：达到 SMS_CODE_MAX_ATTEMPTS 的码视同无效（正常已被作废标记 used）
    const smsCode = await prisma.smsCode.findFirst({
      where: {
        phone,
        type: "reset",
        used: false,
        attempts: { lt: SMS_CODE_MAX_ATTEMPTS },
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!smsCode) {
      // 验证码类失败不计入账户锁定池（与 register 口径一致）：否则攻击者无需任何验证码，
      // 对受害者手机号连发错误验证码即可触发锁号 DoS。防爆破由单码失败计数承担
      // （recordSmsCodeFailure 递增 attempts，达上限自动作废该验证码）。
      // 反枚举：与"码不匹配"统一错误码（配合 send-code 假发送）
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

    // IP 绑定校验（核销之前执行，失败不烧码）：验证码使用 IP 需与发送 IP 一致（可配置）
    if (process.env.SMS_VERIFY_IP_BIND === "true" && smsCode.ipAddress) {
      const verifyIp = getRateLimitClientIP(request);
      if (verifyIp !== smsCode.ipAddress) {
        apiConsole.warn(
          `[ResetPassword] IP 不匹配: 发送IP=${smsCode.ipAddress}, 校验IP=${verifyIp}, 手机=${phone}`
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

    if (!verifyCode(phone, code, "reset", smsCode.codeHash)) {
      // 单码失败计数：达到上限自动作废该验证码（防爆破，与账户锁定叠加）
      await recordSmsCodeFailure(smsCode.id);
      // 验证码类失败不写入 LoginAttempt（不计入账户锁定池，与 register 口径一致）：
      // 防止攻击者无需验证码即可通过连发错误验证码锁定受害者账号（锁号 DoS）
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
            code: "CODE_INVALID",
            message: "验证码错误或已过期",
          },
        },
        { status: 400 }
      );
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, phone: true, status: true },
    });

    if (!user) {
      // 使用通用错误，避免泄露手机号是否注册
      await recordLoginAttempt(phone, false, request, "user_not_found", "sms");
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RESET_FAILED",
            message: "重置失败，请检查手机号和验证码",
          },
        },
        { status: 400 }
      );
    }

    // 校验账号状态
    const statusCheck = await checkUserStatus(user.id);
    if (!statusCheck.valid) {
      await recordLoginAttempt(phone, false, request, "account_disabled", "sms");
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_DISABLED",
            message: statusCheck.reason,
          },
        },
        { status: 403 }
      );
    }

    // 重置密码（含密码历史检查与过期策略）
    const updateResult = await updateUserPassword(user.id, password);
    if (!updateResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: updateResult.errorCode,
            message: updateResult.errorMessage,
          },
        },
        { status: 400 }
      );
    }

    // 旧 access token 即时失效：由 updateUserPassword 写入的 passwordChangedAt 实现
    //（verifyUserToken 比对 token iat < passwordChangedAt 即拒绝）。
    // 不再使用 user 级黑名单：那会连受害者本人重新登录后签发的新 token 一并封锁 15 分钟。

    // 密码重置后撤销所有 session，在事务中完成保证一致性
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const sessions = await tx.oAuthSession.findMany({
        where: { userId: user.id, revokedAt: null },
        select: { clientId: true },
      });
      if (sessions.length > 0) {
        await tx.oAuthSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.refreshToken.updateMany({
          where: { userId: user.id, clientId: { not: null }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    // 清除所有类型的失败记录（短信 + 密码）
    await clearLoginAttempts(phone);

    // 向用户发送安全通知：密码已被重置
    sendPasswordChangedNotification(phone).catch((err) => {
      apiConsole.error("[ResetPassword] 安全通知发送失败:", err);
    });

    logAuthEvent("user_reset_password", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      ip: getClientIP(request),
    });

    return NextResponse.json({
      success: true,
      data: { message: "密码重置成功，请使用新密码登录" },
    });
  } catch (error) {
    apiConsole.error("[ResetPassword] 异常:", error);
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

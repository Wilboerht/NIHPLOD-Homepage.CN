/**
 * 重置密码 API
 * POST /api/auth/reset-password
 * 通过短信验证码重置密码（忘记密码场景）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, passwordSchema } from "@/lib/password";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import { rateLimit } from "@/lib/ratelimit";
import { checkAccountLockout, recordLoginAttempt, clearLoginAttempts } from "@/lib/auth-security";
import { checkUserStatus } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { verifyCode, sendPasswordChangedNotification } from "@/lib/sms";

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
  const ipLimit = await rateLimit(ip, "reset-password", { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.success) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请 15 分钟后再试" } },
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
    const smsCode = await prisma.smsCode.findFirst({
      where: {
        phone,
        type: "reset",
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

    if (!verifyCode(phone, code, "reset", smsCode.codeHash)) {
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

    // 重置密码
    const hashedPassword = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // 密码重置后撤销该用户所有 Refresh Token，强制所有设备重新登录
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 清除失败记录
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

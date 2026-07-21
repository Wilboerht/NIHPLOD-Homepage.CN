/**
 * 无密码用户设置密码（微信注册用户首次设置密码）
 * POST /api/user/password/set
 *
 * 适用场景：
 * - 通过微信 OAuth 自动注册的用户，系统生成了随机密码但用户不知情
 * - 仅通过 SMS 验证码登录、从未设置过密码的用户
 *
 * 安全说明：
 * - 必须已登录 + 短信验证码验证
 * - 仅允许 password 为 null 的用户设置（已设密码用户请用 PUT /api/user/password 修改）
 * - 不撤销 Refresh Token
 * - 设置成功后发送安全通知短信
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { verifyCode } from "@/lib/sms";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { getClientIP } from "@/lib/client-ip";
import { logAuthEvent } from "@/lib/auth-logger";
import { sendPasswordChangedNotification } from "@/lib/sms";

const setPasswordSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "验证码为6位数字"),
    password: z
      .string()
      .min(8, "密码至少8位")
      .max(32, "密码最多32位")
      .regex(/[A-Z]/, "密码需包含大写字母")
      .regex(/[a-z]/, "密码需包含小写字母")
      .regex(/[0-9]/, "密码需包含数字"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  });

export const dynamic = "force-dynamic";

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const body = await request.json();
    const result = setPasswordSchema.safeParse(body);
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

    const { code, password } = result.data;

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, phone: true, password: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    if (user.password) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PASSWORD_ALREADY_SET",
            message: "已设置过密码，请使用修改密码功能",
          },
        },
        { status: 400 }
      );
    }

    const smsCode = await prisma.smsCode.findFirst({
      where: {
        phone: user.phone,
        type: "reset",
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

    if (!verifyCode(user.phone, code, "reset", smsCode.codeHash)) {
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

    const hashedPassword = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    sendPasswordChangedNotification(user.phone).catch((err) => {
      apiConsole.error("[SetPassword] 安全通知发送失败:", err);
    });

    logAuthEvent("user_set_password", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      ip: getClientIP(request),
    });

    return NextResponse.json({
      success: true,
      data: { message: "密码设置成功" },
    });
  } catch (error) {
    apiConsole.error("[SetPassword] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

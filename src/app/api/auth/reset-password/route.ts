/**
 * 重置密码 API
 * POST /api/auth/reset-password
 * 通过短信验证码重置密码（忘记密码场景）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { z } from "zod";

// 请求参数验证
const resetPasswordSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  code: z.string().length(6, "验证码为6位数字"),
  password: z.string().min(6, "密码至少6位").max(32, "密码最多32位"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});

export async function POST(request: NextRequest) {
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

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "该手机号未注册",
          },
        },
        { status: 400 }
      );
    }

    // 重置密码
    const hashedPassword = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    console.log(`[ResetPassword] 用户重置密码: ${phone.slice(0, 3)}****${phone.slice(-4)}`);

    return NextResponse.json({
      success: true,
      data: { message: "密码重置成功，请使用新密码登录" },
    });
  } catch (error) {
    console.error("[ResetPassword] 异常:", error);
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


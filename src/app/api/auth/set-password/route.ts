/**
 * 设置/修改密码 API
 * POST /api/auth/set-password
 * 需要先通过短信验证码验证身份
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, passwordSchema } from "@/lib/password";
import { verifyUserAuth } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";

// 请求参数验证 - 首次设置密码（需要验证码）
const setPasswordSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  code: z.string().length(6, "验证码为6位数字"),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});

// 请求参数验证 - 修改密码（需要旧密码）
const changePasswordSchema = z.object({
  oldPassword: z.string().min(6, "密码至少6位"),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 检查是修改密码还是设置密码
    const isChangingPassword = "oldPassword" in body;

    if (isChangingPassword) {
      // 修改密码流程 - 需要登录
      const userPayload = await verifyUserAuth(request);
      if (!userPayload) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "请先登录",
            },
          },
          { status: 401 }
        );
      }

      const result = changePasswordSchema.safeParse(body);
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

      const { oldPassword, newPassword } = result.data;

      // 获取用户
      const user = await prisma.user.findUnique({
        where: { id: userPayload.id },
      });

      if (!user || !user.password) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PASSWORD_NOT_SET",
              message: "尚未设置密码",
            },
          },
          { status: 400 }
        );
      }

      // 验证旧密码
      const isValid = await verifyPassword(oldPassword, user.password);
      if (!isValid) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PASSWORD_INCORRECT",
              message: "原密码错误",
            },
          },
          { status: 400 }
        );
      }

      // 更新密码
      const hashedPassword = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      // 密码变更后撤销该用户所有 Refresh Token，强制所有设备重新登录
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

      logAuthEvent("user_set_password", {
        userId: user.id,
        identifier: user.phone,
        success: true,
        action: "change",
        ip: getClientIP(request),
      });

      return NextResponse.json({
        success: true,
        data: { message: "密码修改成功，请重新登录" },
      });
    } else {
      // 设置密码流程 - 需要验证码
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

      const { phone, code, password } = result.data;

      // 验证验证码
      const smsCode = await prisma.smsCode.findFirst({
        where: {
          phone,
          type: "reset", // 使用 reset 类型的验证码
          used: false,
          expiresAt: { gte: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!smsCode || smsCode.code !== code) {
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
              message: "用户不存在",
            },
          },
          { status: 400 }
        );
      }

      // 设置密码
      const hashedPassword = await hashPassword(password);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      logAuthEvent("user_set_password", {
        userId: user.id,
        identifier: user.phone,
        success: true,
        action: "set",
        ip: getClientIP(request),
      });

      return NextResponse.json({
        success: true,
        data: { message: "密码设置成功" },
      });
    }
  } catch (error) {
    apiConsole.error("[SetPassword] 异常:", error);
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


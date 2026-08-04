/**
 * 已登录用户修改密码
 * PUT /api/user/password
 *
 * 安全说明：
 * - 必须提供旧密码验证身份
 * - 不撤销 Refresh Token（与找回密码不同，这是自主行为）
 * - 修改成功后发送安全通知短信
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { verifyPassword, passwordSchema } from "@/lib/password";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { getClientIP } from "@/lib/client-ip";
import { logAuthEvent } from "@/lib/auth-logger";
import { sendPasswordChangedNotification } from "@/lib/sms";
import { updateUserPassword } from "@/lib/password-policy";

const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "请输入旧密码"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "两次新密码不一致",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.oldPassword, {
    message: "新密码不能与旧密码相同",
    path: ["newPassword"],
  });

export const dynamic = "force-dynamic";

export const PUT = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const body = await request.json();
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

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, password: true, phone: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PASSWORD_NOT_SET",
            message: "该账号未设置密码，请通过短信验证码设置密码",
          },
        },
        { status: 400 }
      );
    }

    const isValidOld = await verifyPassword(oldPassword, user.password);
    if (!isValidOld) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PASSWORD_INCORRECT",
            message: "旧密码错误",
          },
        },
        { status: 400 }
      );
    }

    const updateResult = await updateUserPassword(user.id, newPassword);
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

    sendPasswordChangedNotification(user.phone).catch((err) => {
      apiConsole.error("[ChangePassword] 安全通知发送失败:", err);
    });

    logAuthEvent("user_set_password", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      ip: getClientIP(request),
    });

    return NextResponse.json({
      success: true,
      data: { message: "密码修改成功" },
    });
  } catch (error) {
    apiConsole.error("[ChangePassword] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

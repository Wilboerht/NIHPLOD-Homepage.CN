/**
 * 已登录用户修改密码
 * PUT /api/user/password
 *
 * 安全说明：
 * - 必须提供旧密码验证身份，失败计入账户防爆破（5 次锁 30 分钟）
 * - 修改成功后撤销其他设备的 Refresh Token 与 OAuth 会话，保留当前设备
 *   （防止会话被劫持后受害者改密但攻击者仍可续期）
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
import {
  checkAccountLockout,
  recordLoginAttempt,
  clearLoginAttempts,
  hashRefreshToken,
} from "@/lib/auth-security";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";

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

    // 账户级防爆破：持有会话者也限制旧密码试错次数
    const { locked, remainingMinutes } = await checkAccountLockout(user.phone);
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
      await recordLoginAttempt(user.phone, false, request, "password_incorrect", "password");
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

    // 清除密码类型的失败记录
    await clearLoginAttempts(user.phone, "password");

    // 撤销其他设备会话，保留当前设备：
    // 当前设备的 refresh token 通过 Cookie 哈希比对识别；无 Cookie（Bearer 调用）时撤销全部。
    // OAuth 会话与 OAuth 作用域的 refresh token 一并撤销，与 reset-password 口径一致。
    try {
      const currentRefresh = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;
      const currentHash = currentRefresh ? hashRefreshToken(currentRefresh) : null;

      // 内部（非 OAuth）refresh token：保留当前设备，撤销其余
      await prisma.refreshToken.updateMany({
        where: {
          userId: user.id,
          clientId: null,
          revokedAt: null,
          ...(currentHash ? { token: { not: currentHash } } : {}),
        },
        data: { revokedAt: new Date() },
      });

      // OAuth 作用域的 refresh token 全部撤销（属于第三方应用授权，改密后应重新授权）
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, clientId: { not: null }, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 同步撤销 OAuth 会话，使携带 sid 的 access token 即时失效
      await prisma.oAuthSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch (err) {
      // 密码已修改成功，会话撤销失败不阻断主流程，仅记录（风险窗口由 token 自然过期兜底）
      apiConsole.error("[ChangePassword] 撤销其他设备会话失败:", err);
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

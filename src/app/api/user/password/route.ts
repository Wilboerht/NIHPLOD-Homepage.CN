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
import { revokeOtherSessionsAfterCredentialChange } from "@/lib/session-revocation";
import {
  checkAccountLockout,
  recordLoginAttempt,
  clearLoginAttempts,
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

    // 账户级防爆破：持有会话者也限制旧密码试错次数。
    // 使用独立 scope（password:），避免与登录失败共享锁定桶：
    // 既防止"改密试错连带锁死登录"，也防止"登录爆破连带锁死改密"。
    const { locked, remainingMinutes } = await checkAccountLockout(`password:${user.phone}`);
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
      await recordLoginAttempt(`password:${user.phone}`, false, request, "password_incorrect", "password");
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

    // 清除密码类型的失败记录（与 checkAccountLockout 使用同一 scope 前缀）
    await clearLoginAttempts(`password:${user.phone}`, "password");

    // 撤销其他设备会话（保留当前设备）：
    // 内部 token 按 Cookie 哈希保留当前设备；OAuth token/会话全撤并 backchannel 通知
    try {
      await revokeOtherSessionsAfterCredentialChange({
        userId: user.id,
        currentRefreshToken: request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value ?? null,
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

/**
 * 密码管理核心逻辑（会话路由 /api/user/password* 与 OAuth 资源端点 /api/oauth/user/password* 共用）
 *
 * - 修改密码：旧密码验证 + 账户防爆破（独立 password: scope，不牵连登录锁定）
 * - 首次设置密码：短信验证码（type=reset）验证，仅限 password 为 null 的账号
 * - 发送设置密码验证码：向当前账号自己的手机号发码（前端无需传手机号）
 *
 * 三个动作成功后均撤销其他设备会话（会话通道保留当前设备；OAuth 通道无 Cookie 全撤
 * 并 backchannel 通知子站）、发送安全通知并失效资料缓存（hasPassword 立即更新）。
 * 本模块只承载业务核心；鉴权、CSRF、限流与响应格式由各调用方路由负责。
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { passwordSchema, verifyPassword } from "@/lib/password";
import {
  verifyCode,
  recordSmsCodeFailure,
  SMS_CODE_MAX_ATTEMPTS,
  sendLoginCode,
  sendPasswordChangedNotification,
  generateVerifyCode,
  hashVerifyCode,
} from "@/lib/sms";
import { updateUserPassword } from "@/lib/password-policy";
import { revokeOtherSessionsAfterCredentialChange } from "@/lib/session-revocation";
import { invalidateProfileCache } from "@/lib/points";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import {
  checkAccountLockout,
  recordLoginAttempt,
  clearLoginAttempts,
} from "@/lib/auth-security";
import { apiConsole } from "@/lib/logger";

// 设置密码验证码有效期（分钟）/ 发送间隔（秒）/ 每小时上限（与 /api/auth/send-code 同口径）
const CODE_EXPIRE_MINUTES = 5;
const SEND_INTERVAL_SECONDS = 60;
const MAX_SEND_PER_HOUR = 5;

export const changePasswordSchema = z
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

export const setPasswordSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "验证码为6位数字"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  });

/** 业务错误（code/status 由路由按各通道响应格式透出） */
export interface PasswordManageError {
  status: number;
  code: string;
  message: string;
}

export type PasswordManageResult<T> = { ok: true; data: T } | { ok: false; error: PasswordManageError };

function fail(status: number, code: string, message: string): { ok: false; error: PasswordManageError } {
  return { ok: false, error: { status, code, message } };
}

/** 是否为可接收短信的真实手机号（微信占位手机号 wx_ 前缀不满足） */
function isRealPhone(phone: string | null | undefined): boolean {
  return /^1[3-9]\d{9}$/.test(phone ?? "");
}

/** 凭证变更后的统一收尾：撤销会话（失败不阻断）+ 安全通知 + 失效资料缓存 + 审计 */
async function afterCredentialChange(params: {
  userId: string;
  phone: string;
  ip: string;
  currentRefreshToken?: string | null;
  clientId?: string;
  logTag: string;
}): Promise<void> {
  try {
    await revokeOtherSessionsAfterCredentialChange({
      userId: params.userId,
      currentRefreshToken: params.currentRefreshToken ?? null,
    });
  } catch (err) {
    // 密码已变更成功，会话撤销失败不阻断主流程，仅记录（风险窗口由 token 自然过期兜底）
    apiConsole.error(`[${params.logTag}] 撤销其他设备会话失败:`, err);
  }

  sendPasswordChangedNotification(params.phone).catch((err) => {
    apiConsole.error(`[${params.logTag}] 安全通知发送失败:`, err);
  });

  // 失效资料缓存：profile 缓存携带 hasPassword，变更后必须立即失效
  invalidateProfileCache();

  logAuthEvent("user_set_password", {
    userId: params.userId,
    identifier: params.phone,
    success: true,
    ip: params.ip,
    ...(params.clientId ? { clientId: params.clientId } : {}),
  });
}

/**
 * 修改密码（旧密码验证）
 * 失败计入独立防爆破 scope（password:），不写入登录锁定池
 */
export async function changePassword(params: {
  userId: string;
  request: NextRequest;
  oldPassword: string;
  newPassword: string;
  currentRefreshToken?: string | null;
  /** 来源 OAuth 客户端（子站 BFF 通道）：仅用于审计留痕 */
  clientId?: string;
}): Promise<PasswordManageResult<{ message: string }>> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, password: true, phone: true },
    });

    if (!user) {
      return fail(404, "USER_NOT_FOUND", "用户不存在");
    }

    // 账户级防爆破：持有会话者也限制旧密码试错次数。
    // 使用独立 scope（password:），避免与登录失败共享锁定桶：
    // 既防止"改密试错连带锁死登录"，也防止"登录爆破连带锁死改密"。
    const { locked, remainingMinutes } = await checkAccountLockout(`password:${user.phone}`);
    if (locked) {
      return fail(429, "ACCOUNT_LOCKED", `操作过于频繁，请在 ${remainingMinutes} 分钟后重试`);
    }

    if (!user.password) {
      return fail(400, "PASSWORD_NOT_SET", "该账号未设置密码，请通过短信验证码设置密码");
    }

    const isValidOld = await verifyPassword(params.oldPassword, user.password);
    if (!isValidOld) {
      await recordLoginAttempt(`password:${user.phone}`, false, params.request, "password_incorrect", "password");
      return fail(400, "PASSWORD_INCORRECT", "旧密码错误");
    }

    const updateResult = await updateUserPassword(user.id, params.newPassword);
    if (!updateResult.success) {
      return fail(
        400,
        updateResult.errorCode ?? "PASSWORD_UPDATE_FAILED",
        updateResult.errorMessage ?? "密码更新失败"
      );
    }

    // 清除该 scope 的失败记录（不传 type：清除所有类型，与 checkAccountLockout 使用同一 scope 前缀）
    await clearLoginAttempts(`password:${user.phone}`);

    await afterCredentialChange({
      userId: user.id,
      phone: user.phone,
      ip: getClientIP(params.request),
      currentRefreshToken: params.currentRefreshToken,
      clientId: params.clientId,
      logTag: "ChangePassword",
    });

    return { ok: true, data: { message: "密码修改成功" } };
  } catch (error) {
    apiConsole.error("[ChangePassword] 异常:", error);
    return fail(500, "INTERNAL_ERROR", "服务器错误");
  }
}

/**
 * 首次设置密码（短信验证码，type=reset）
 * 仅允许 password 为 null 的账号；已设密码请走修改密码
 */
export async function setPassword(params: {
  userId: string;
  request: NextRequest;
  code: string;
  password: string;
  currentRefreshToken?: string | null;
  clientId?: string;
}): Promise<PasswordManageResult<{ message: string }>> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, phone: true, password: true },
    });

    if (!user) {
      return fail(404, "USER_NOT_FOUND", "用户不存在");
    }

    if (user.password) {
      return fail(400, "PASSWORD_ALREADY_SET", "已设置过密码，请使用修改密码功能");
    }

    // attempts 上限兜底：达到 SMS_CODE_MAX_ATTEMPTS 的码视同无效（正常已被作废标记 used）
    const smsCode = await prisma.smsCode.findFirst({
      where: {
        phone: user.phone,
        type: "reset",
        used: false,
        attempts: { lt: SMS_CODE_MAX_ATTEMPTS },
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!smsCode) {
      // 反枚举：与"码不匹配"统一错误码
      return fail(400, "CODE_INVALID", "验证码错误或已过期");
    }

    // IP 绑定校验（核销之前执行，失败不烧码）：验证码使用 IP 需与发送 IP 一致（可配置）
    if (process.env.SMS_VERIFY_IP_BIND === "true" && smsCode.ipAddress) {
      const verifyIp = getClientIP(params.request);
      if (verifyIp !== smsCode.ipAddress) {
        apiConsole.warn(
          `[SetPassword] IP 不匹配: 发送IP=${smsCode.ipAddress}, 校验IP=${verifyIp}`
        );
        return fail(400, "IP_MISMATCH", "验证环境异常，请重新获取验证码");
      }
    }

    if (!verifyCode(user.phone, params.code, "reset", smsCode.codeHash)) {
      // 单码失败计数：达到上限自动作废该验证码（防爆破）
      await recordSmsCodeFailure(smsCode.id);
      return fail(400, "CODE_INVALID", "验证码错误或已过期");
    }

    const consumeResult = await prisma.smsCode.updateMany({
      where: { id: smsCode.id, used: false },
      data: { used: true },
    });
    if (consumeResult.count === 0) {
      return fail(400, "CODE_INVALID", "验证码错误或已过期");
    }

    const updateResult = await updateUserPassword(user.id, params.password);
    if (!updateResult.success) {
      return fail(
        400,
        updateResult.errorCode ?? "PASSWORD_UPDATE_FAILED",
        updateResult.errorMessage ?? "密码更新失败"
      );
    }

    // 撤销其他设备会话（保留当前设备）：设置密码属于账号加固动作，
    // 必须让此前可能被盗的 refresh token 失效（与改密口径一致）
    await afterCredentialChange({
      userId: user.id,
      phone: user.phone,
      ip: getClientIP(params.request),
      currentRefreshToken: params.currentRefreshToken,
      clientId: params.clientId,
      logTag: "SetPassword",
    });

    return { ok: true, data: { message: "密码设置成功" } };
  } catch (error) {
    apiConsole.error("[SetPassword] 异常:", error);
    return fail(500, "INTERNAL_ERROR", "服务器错误");
  }
}

/**
 * 发送"设置密码"验证码（type=reset）到当前账号自己的手机号
 * 前端不传手机号（避免枚举/串号），微信占位手机号无短信通道直接拒绝
 */
export async function sendPasswordSetCode(params: {
  userId: string;
  request: NextRequest;
  clientId?: string;
}): Promise<PasswordManageResult<{ expiresIn: number }>> {
  const ip = getClientIP(params.request);

  // 生产环境短信通道必须为真实 provider（与 /api/auth/send-code 同口径）
  const smsProvider = process.env.SMS_PROVIDER;
  if (
    process.env.NODE_ENV === "production" &&
    smsProvider !== "aliyun" &&
    smsProvider !== "tencent"
  ) {
    apiConsole.error(
      `[PasswordSetCode] 生产环境 SMS_PROVIDER 无效（${smsProvider ?? "未设置"}），短信服务不可用`
    );
    return fail(503, "SMS_UNAVAILABLE", "短信服务暂不可用");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, phone: true },
    });
    if (!user) {
      return fail(404, "USER_NOT_FOUND", "用户不存在");
    }
    if (!isRealPhone(user.phone)) {
      return fail(400, "PHONE_NOT_BOUND", "当前账号未绑定手机号，无法发送验证码");
    }

    const phone = user.phone;

    // 发送间隔（同一 phone+type 60 秒）
    const oneMinuteAgo = new Date(Date.now() - SEND_INTERVAL_SECONDS * 1000);
    const recentCode = await prisma.smsCode.findFirst({
      where: { phone, type: "reset", createdAt: { gte: oneMinuteAgo } },
      orderBy: { createdAt: "desc" },
    });
    if (recentCode) {
      const waitSeconds = Math.ceil(
        (recentCode.createdAt.getTime() + SEND_INTERVAL_SECONDS * 1000 - Date.now()) / 1000
      );
      return fail(429, "TOO_FREQUENT", `请${waitSeconds}秒后重试`);
    }

    // 每小时上限
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCount = await prisma.smsCode.count({
      where: { phone, createdAt: { gte: oneHourAgo } },
    });
    if (hourlyCount >= MAX_SEND_PER_HOUR) {
      return fail(429, "RATE_LIMITED", "发送次数过多，请稍后再试");
    }

    const code = generateVerifyCode();
    if (process.env.NODE_ENV === "development") {
      apiConsole.debug(`[DEV-SMS] 手机: ${phone} | 类型: reset | 验证码: ${code}`);
    }
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);
    const codeHash = hashVerifyCode(phone, code, "reset");

    // 作废同 phone+type 的旧未使用码（确保 partial unique index 约束）
    await prisma.smsCode.updateMany({
      where: { phone, type: "reset", used: false },
      data: { used: true },
    });

    await prisma.smsCode.create({
      data: { phone, codeHash, type: "reset", expiresAt, ipAddress: ip },
    });

    const smsResult = await sendLoginCode(phone, code);
    if (!smsResult.success) {
      // 运营商发送失败（未交付）：删除已入库的行，释放 60s 冷却与小时配额
      apiConsole.error("[PasswordSetCode] 短信发送失败:", smsResult.error);
      await prisma.smsCode.deleteMany({
        where: { phone, type: "reset", used: false },
      });
      return fail(500, "SMS_FAILED", "验证码发送失败，请稍后重试");
    }

    logAuthEvent("send_sms_code", {
      userId: user.id,
      identifier: phone,
      success: true,
      type: "reset",
      ip,
      ...(params.clientId ? { clientId: params.clientId } : {}),
    });

    return { ok: true, data: { expiresIn: CODE_EXPIRE_MINUTES * 60 } };
  } catch (error) {
    // partial unique index 冲突：并发发送兜底
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return fail(429, "TOO_FREQUENT", "操作过于频繁，请稍后重试");
    }
    apiConsole.error("[PasswordSetCode] 异常:", error);
    return fail(500, "INTERNAL_ERROR", "服务器错误");
  }
}

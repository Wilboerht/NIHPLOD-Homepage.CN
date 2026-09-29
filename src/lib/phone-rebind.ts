/**
 * 换绑手机号核心逻辑（会话路由 /api/user/phone* 与 OAuth 资源端点 /api/oauth/phone* 共用）
 *
 * 双向验证：当前手机号验证码（验证身份）+ 新手机号验证码（验证新号码所有权）；
 * 微信占位手机号（wx_ 前缀）账号无短信通道，跳过当前手机验证，仅需新手机验证码。
 *
 * 安全口径与 /api/auth/reset-password 一致：
 * - 单码失败计数（recordSmsCodeFailure）防爆破，不写入账户锁定池（防锁号 DoS）
 * - 可选 IP 绑定校验（SMS_VERIFY_IP_BIND）
 * - 原子核销（updateMany used:false 防并发重用）
 *
 * 本模块只承载业务核心；鉴权（会话 Cookie/Bearer）、CSRF、限流与响应格式
 * 由各调用方路由负责，保证两条通道（主站会话 / 子站 OAuth）单一口径。
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  verifyCode,
  recordSmsCodeFailure,
  SMS_CODE_MAX_ATTEMPTS,
  sendLoginCode,
  sendPhoneChangedNotification,
  generateVerifyCode,
  hashVerifyCode,
} from "@/lib/sms";
import { maskPhone } from "@/lib/mask-phone";
import { invalidateProfileCache } from "@/lib/points";
import { logAuthEvent } from "@/lib/auth-logger";
import { revokeOtherSessionsAfterCredentialChange } from "@/lib/session-revocation";
import { apiConsole } from "@/lib/logger";

// 验证码有效期（分钟）/ 发送间隔（秒）/ 每小时上限
const CODE_EXPIRE_MINUTES = 5;
const SEND_INTERVAL_SECONDS = 60;
const MAX_SEND_PER_HOUR = 5;

export const sendRebindCodeSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("current") }),
  z.object({
    target: z.literal("new"),
    newPhone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  }),
]);

export const changePhoneSchema = z.object({
  newPhone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  // 当前手机验证码：当前账号为真实手机号时必填；微信占位手机号（wx_ 前缀）账号无可用
  // 短信通道，已在会话内完成身份证明（微信 OAuth），换绑时仅需新手机验证码
  currentCode: z.string().regex(/^\d{6}$/, "当前手机验证码为 6 位数字").optional(),
  newCode: z.string().regex(/^\d{6}$/, "新手机验证码为 6 位数字"),
});

/** 业务错误（code/status 由路由按各通道响应格式透出） */
export interface PhoneRebindError {
  status: number;
  code: string;
  message: string;
}

export type PhoneRebindResult<T> = { ok: true; data: T } | { ok: false; error: PhoneRebindError };

function fail(status: number, code: string, message: string): { ok: false; error: PhoneRebindError } {
  return { ok: false, error: { status, code, message } };
}

/** 是否为可接收短信的真实手机号（微信占位手机号 wx_ 前缀不满足） */
function isRealPhone(phone: string | null | undefined): boolean {
  return /^1[3-9]\d{9}$/.test(phone ?? "");
}

/** 查找并校验一条未使用的验证码记录（过期/尝试次数兜底） */
async function findUsableCode(phone: string, type: string) {
  return prisma.smsCode.findFirst({
    where: {
      phone,
      type,
      used: false,
      attempts: { lt: SMS_CODE_MAX_ATTEMPTS },
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** 统一验证码错误（与 reset-password 反枚举口径一致） */
function codeInvalidError() {
  return fail(400, "CODE_INVALID", "验证码错误或已过期");
}

/**
 * 发送换绑验证码（第一步）
 * - target=current：向当前登录手机号发码（验证身份，type=rebind-current）
 * - target=new：向新手机号发码（验证新号码所有权，type=rebind-new），
 *   新号码已注册时返回 PHONE_IN_USE（需登录态，无防枚举的假发送需求）
 *
 * @param ip 用于写入验证码记录的来源 IP（可选 IP 绑定校验在换绑时核对）
 */
export async function sendPhoneRebindCode(params: {
  userId: string;
  ip: string;
  target: "current" | "new";
  newPhone?: string;
  /** 来源 OAuth 客户端（子站 BFF 通道）：仅用于审计留痕 */
  clientId?: string;
}): Promise<PhoneRebindResult<{ expiresIn: number }>> {
  const { userId, ip, target } = params;

  // 生产环境短信通道必须为真实 provider（与 /api/auth/send-code 同口径）
  const smsProvider = process.env.SMS_PROVIDER;
  if (
    process.env.NODE_ENV === "production" &&
    smsProvider !== "aliyun" &&
    smsProvider !== "tencent"
  ) {
    apiConsole.error(
      `[PhoneRebind] 生产环境 SMS_PROVIDER 无效（${smsProvider ?? "未设置"}），短信服务不可用`
    );
    return fail(503, "SMS_UNAVAILABLE", "短信服务暂不可用");
  }

  try {
    // 当前用户手机号（发送到当前手机的标识）
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true },
    });
    if (!user) {
      return fail(404, "USER_NOT_FOUND", "用户不存在");
    }

    let targetPhone = user.phone;
    let type = "rebind-current";

    if (target === "current") {
      // 微信占位手机号（wx_ 前缀）无短信通道：引导前端直接走新手机验证
      if (!isRealPhone(user.phone)) {
        return fail(400, "UNSUPPORTED_PHONE", "当前账号未绑定手机号，请直接验证新手机号后换绑");
      }
    }

    if (target === "new") {
      const newPhone = params.newPhone;
      if (!newPhone) {
        return fail(400, "INVALID_PARAMS", "请提供新手机号");
      }
      if (newPhone === user.phone) {
        return fail(400, "SAME_PHONE", "新手机号不能与当前手机号相同");
      }
      // 新号码已被注册则拒绝（需登录态才能走到这里，无需防枚举假发送）
      const existing = await prisma.user.findUnique({
        where: { phone: newPhone },
        select: { id: true },
      });
      if (existing) {
        return fail(400, "PHONE_IN_USE", "该手机号已被注册");
      }
      targetPhone = newPhone;
      type = "rebind-new";
    }

    // 发送间隔（同一 phone+type 60 秒）
    const oneMinuteAgo = new Date(Date.now() - SEND_INTERVAL_SECONDS * 1000);
    const recentCode = await prisma.smsCode.findFirst({
      where: { phone: targetPhone, type, createdAt: { gte: oneMinuteAgo } },
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
      where: { phone: targetPhone, createdAt: { gte: oneHourAgo } },
    });
    if (hourlyCount >= MAX_SEND_PER_HOUR) {
      return fail(429, "RATE_LIMITED", "发送次数过多，请稍后再试");
    }

    const code = generateVerifyCode();
    if (process.env.NODE_ENV === "development") {
      apiConsole.debug(`[DEV-SMS] 手机: ${targetPhone} | 类型: ${type} | 验证码: ${code}`);
    }
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);
    const codeHash = hashVerifyCode(targetPhone, code, type);

    // 作废同 phone+type 的旧未使用码（确保 partial unique index 约束）
    await prisma.smsCode.updateMany({
      where: { phone: targetPhone, type, used: false },
      data: { used: true },
    });

    await prisma.smsCode.create({
      data: {
        phone: targetPhone,
        codeHash,
        type,
        expiresAt,
        ipAddress: ip,
      },
    });

    const smsResult = await sendLoginCode(targetPhone, code);
    if (!smsResult.success) {
      apiConsole.error("[PhoneRebind] 短信发送失败:", smsResult.error);
      await prisma.smsCode.updateMany({
        where: { phone: targetPhone, type, used: false },
        data: { used: true },
      });
      return fail(500, "SMS_FAILED", "验证码发送失败，请稍后重试");
    }

    logAuthEvent("send_sms_code", {
      userId: user.id,
      identifier: targetPhone,
      success: true,
      type,
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
    apiConsole.error("[PhoneRebind] send-code 异常:", error);
    return fail(500, "INTERNAL_ERROR", "服务器错误");
  }
}

/**
 * 换绑手机号（第二步：双向验证码核销）
 *
 * @param ip 校验 IP 绑定（SMS_VERIFY_IP_BIND=true 时与发码记录 IP 比对）
 * @param currentRefreshToken 当前请求携带的 refresh token（会话路由传入以保留当前设备）；
 *   OAuth 端点无 Cookie：传 null → 内部 refresh token 全撤、OAuth 会话全撤并 backchannel 通知子站
 */
export async function changeUserPhone(params: {
  userId: string;
  ip: string;
  newPhone: string;
  currentCode?: string;
  newCode: string;
  currentRefreshToken?: string | null;
  /** 来源 OAuth 客户端（子站 BFF 通道）：仅用于审计留痕 */
  clientId?: string;
}): Promise<PhoneRebindResult<{ phone: string }>> {
  const { userId, ip, newPhone, currentCode, newCode } = params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true },
    });
    if (!user) {
      return fail(404, "USER_NOT_FOUND", "用户不存在");
    }

    if (newPhone === user.phone) {
      return fail(400, "SAME_PHONE", "新手机号不能与当前手机号相同");
    }

    const needCurrentVerification = isRealPhone(user.phone);
    if (needCurrentVerification && !currentCode) {
      return fail(400, "INVALID_PARAMS", "请先获取当前手机验证码");
    }

    // 新手机号必须未被注册
    const existing = await prisma.user.findUnique({
      where: { phone: newPhone },
      select: { id: true },
    });
    if (existing) {
      return fail(400, "PHONE_IN_USE", "该手机号已被注册");
    }

    // 1. 校验当前手机号验证码（验证身份；微信占位手机号账号无短信通道，跳过此步）
    let currentSmsCode: Awaited<ReturnType<typeof findUsableCode>> = null;
    if (needCurrentVerification) {
      currentSmsCode = await findUsableCode(user.phone, "rebind-current");
      if (!currentSmsCode) {
        return codeInvalidError();
      }
      if (process.env.SMS_VERIFY_IP_BIND === "true" && currentSmsCode.ipAddress) {
        if (ip !== currentSmsCode.ipAddress) {
          apiConsole.warn(
            `[PhoneRebind] 当前手机码 IP 不匹配: 发送IP=${currentSmsCode.ipAddress}, 校验IP=${ip}`
          );
          return fail(400, "IP_MISMATCH", "验证环境异常，请重新获取验证码");
        }
      }
      if (!verifyCode(user.phone, currentCode!, "rebind-current", currentSmsCode.codeHash)) {
        await recordSmsCodeFailure(currentSmsCode.id);
        return codeInvalidError();
      }
    }

    // 2. 校验新手机号验证码（验证新号码所有权）
    const newSmsCode = await findUsableCode(newPhone, "rebind-new");
    if (!newSmsCode) {
      return codeInvalidError();
    }
    if (process.env.SMS_VERIFY_IP_BIND === "true" && newSmsCode.ipAddress) {
      if (ip !== newSmsCode.ipAddress) {
        apiConsole.warn(
          `[PhoneRebind] 新手机码 IP 不匹配: 发送IP=${newSmsCode.ipAddress}, 校验IP=${ip}`
        );
        return fail(400, "IP_MISMATCH", "验证环境异常，请重新获取验证码");
      }
    }
    if (!verifyCode(newPhone, newCode, "rebind-new", newSmsCode.codeHash)) {
      await recordSmsCodeFailure(newSmsCode.id);
      return codeInvalidError();
    }

    // 3. 事务内：原子核销验证码 + 更新手机号。
    //    任一失败整体回滚（验证码不会被烧掉，用户可直接重试），
    //    phone 唯一约束冲突（P2002）由外层 catch 映射为 PHONE_IN_USE。
    try {
      await prisma.$transaction(async (tx) => {
        const [consumeCurrent, consumeNew] = await Promise.all([
          currentSmsCode
            ? tx.smsCode.updateMany({
                where: { id: currentSmsCode.id, used: false },
                data: { used: true },
              })
            : Promise.resolve({ count: 1 }),
          tx.smsCode.updateMany({
            where: { id: newSmsCode.id, used: false },
            data: { used: true },
          }),
        ]);
        if (consumeCurrent.count === 0 || consumeNew.count === 0) {
          // 验证码已被并发消费，整体回滚
          throw new Error("CODE_CONSUME_CONFLICT");
        }

        await tx.user.update({
          where: { id: user.id },
          data: { phone: newPhone },
        });
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === "CODE_CONSUME_CONFLICT") {
        return codeInvalidError();
      }
      throw txError;
    }

    // 4. 失效资料缓存（AuthContext 拉取最新手机号）
    invalidateProfileCache();

    logAuthEvent("user_phone_changed", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      detail: { newPhone: maskPhone(newPhone) },
      ...(params.clientId ? { clientId: params.clientId } : {}),
    });

    // 换绑成功后向旧手机号发送安全通知（fail-soft：失败仅记日志，不阻断主流程）；
    // 微信占位手机号（wx_ 前缀）无短信通道，跳过
    if (isRealPhone(user.phone)) {
      sendPhoneChangedNotification(user.phone).catch((err) => {
        apiConsole.error("[PhoneRebind] 旧手机号安全通知发送失败:", err);
      });
    }

    // 5. 账号标识变更 → 撤销其他设备会话（会话通道保留当前设备，OAuth 通道无 Cookie 全撤并 backchannel 通知）
    try {
      await revokeOtherSessionsAfterCredentialChange({
        userId: user.id,
        currentRefreshToken: params.currentRefreshToken ?? null,
      });
    } catch (err) {
      // 换绑已成功，会话撤销失败不阻断流程，记录错误由 token 自然过期兜底
      apiConsole.error("[PhoneRebind] 撤销其他设备会话失败:", err);
    }

    apiConsole.info(`[PhoneRebind] 用户 ${user.id} 换绑手机号成功`);

    return { ok: true, data: { phone: newPhone } };
  } catch (error) {
    // phone 唯一约束冲突：并发下新手机号刚被他人注册
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return fail(400, "PHONE_IN_USE", "该手机号已被注册");
    }
    apiConsole.error("[PhoneRebind] 异常:", error);
    return fail(500, "INTERNAL_ERROR", "服务器错误");
  }
}

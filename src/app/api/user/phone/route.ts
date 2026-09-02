/**
 * 换绑手机号
 * PUT /api/user/phone
 *
 * 双向验证的第二步：核销当前手机号验证码（rebind-current）与
 * 新手机号验证码（rebind-new），通过后更新 User.phone。
 *
 * 安全口径与 /api/auth/reset-password 一致：
 * - 单码失败计数（recordSmsCodeFailure）防爆破，不写入账户锁定池（防锁号 DoS）
 * - 可选 IP 绑定校验（SMS_VERIFY_IP_BIND）
 * - 原子核销（updateMany used:false 防并发重用）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { verifyCode, recordSmsCodeFailure, SMS_CODE_MAX_ATTEMPTS } from "@/lib/sms";
import { invalidateProfileCache } from "@/lib/points";
import { logAuthEvent } from "@/lib/auth-logger";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";

const changePhoneSchema = z.object({
  newPhone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  // 当前手机验证码：当前账号为真实手机号时必填；微信占位手机号（wx_ 前缀）账号无可用
  // 短信通道，已在会话内完成身份证明（微信 OAuth），换绑时仅需新手机验证码
  currentCode: z.string().regex(/^\d{6}$/, "当前手机验证码为 6 位数字").optional(),
  newCode: z.string().regex(/^\d{6}$/, "新手机验证码为 6 位数字"),
});

/** 是否为可接收短信的真实手机号（微信占位手机号 wx_ 前缀不满足） */
function isRealPhone(phone: string | null | undefined): boolean {
  return /^1[3-9]\d{9}$/.test(phone ?? "");
}

export const dynamic = "force-dynamic";

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

/** 统一验证码错误响应（与 reset-password 反枚举口径一致） */
function codeInvalidResponse() {
  return NextResponse.json(
    { success: false, error: { code: "CODE_INVALID", message: "验证码错误或已过期" } },
    { status: 400 }
  );
}

export const PUT = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  // 用户级限流：防已登录用户高频探测手机号是否注册（枚举）与验证码爆破
  const userLimit = await rateLimit(`user:${payload.id}`, "phone-rebind");
  if (!userLimit.success) {
    return NextResponse.json(
      { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = changePhoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { newPhone, currentCode, newCode } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, phone: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    if (newPhone === user.phone) {
      return NextResponse.json(
        { success: false, error: { code: "SAME_PHONE", message: "新手机号不能与当前手机号相同" } },
        { status: 400 }
      );
    }

    const needCurrentVerification = isRealPhone(user.phone);
    if (needCurrentVerification && !currentCode) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "请先获取当前手机验证码" },
        },
        { status: 400 }
      );
    }

    // 新手机号必须未被注册
    const existing = await prisma.user.findUnique({
      where: { phone: newPhone },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "PHONE_IN_USE", message: "该手机号已被注册" } },
        { status: 400 }
      );
    }

    // 1. 校验当前手机号验证码（验证身份；微信占位手机号账号无短信通道，跳过此步）
    let currentSmsCode: Awaited<ReturnType<typeof findUsableCode>> = null;
    if (needCurrentVerification) {
      currentSmsCode = await findUsableCode(user.phone, "rebind-current");
      if (!currentSmsCode) {
        return codeInvalidResponse();
      }
      if (process.env.SMS_VERIFY_IP_BIND === "true" && currentSmsCode.ipAddress) {
        const verifyIp = getClientIP(request);
        if (verifyIp !== currentSmsCode.ipAddress) {
          apiConsole.warn(
            `[PhoneRebind] 当前手机码 IP 不匹配: 发送IP=${currentSmsCode.ipAddress}, 校验IP=${verifyIp}`
          );
          return NextResponse.json(
            {
              success: false,
              error: { code: "IP_MISMATCH", message: "验证环境异常，请重新获取验证码" },
            },
            { status: 400 }
          );
        }
      }
      if (!verifyCode(user.phone, currentCode!, "rebind-current", currentSmsCode.codeHash)) {
        await recordSmsCodeFailure(currentSmsCode.id);
        return codeInvalidResponse();
      }
    }

    // 2. 校验新手机号验证码（验证新号码所有权）
    const newSmsCode = await findUsableCode(newPhone, "rebind-new");
    if (!newSmsCode) {
      return codeInvalidResponse();
    }
    if (process.env.SMS_VERIFY_IP_BIND === "true" && newSmsCode.ipAddress) {
      const verifyIp = getClientIP(request);
      if (verifyIp !== newSmsCode.ipAddress) {
        apiConsole.warn(
          `[PhoneRebind] 新手机码 IP 不匹配: 发送IP=${newSmsCode.ipAddress}, 校验IP=${verifyIp}`
        );
        return NextResponse.json(
          { success: false, error: { code: "IP_MISMATCH", message: "验证环境异常，请重新获取验证码" } },
          { status: 400 }
        );
      }
    }
    if (!verifyCode(newPhone, newCode, "rebind-new", newSmsCode.codeHash)) {
      await recordSmsCodeFailure(newSmsCode.id);
      return codeInvalidResponse();
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
      if (
        txError instanceof Error &&
        txError.message === "CODE_CONSUME_CONFLICT"
      ) {
        return codeInvalidResponse();
      }
      throw txError;
    }

    // 4. 失效资料缓存（AuthContext 拉取最新手机号）
    invalidateProfileCache();

    logAuthEvent("user_phone_changed", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      detail: { newPhone },
    });

    apiConsole.info(`[PhoneRebind] 用户 ${user.id} 换绑手机号成功`);

    return NextResponse.json({ success: true, data: { phone: newPhone } });
  } catch (error) {
    // phone 唯一约束冲突：并发下新手机号刚被他人注册
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: { code: "PHONE_IN_USE", message: "该手机号已被注册" } },
        { status: 400 }
      );
    }
    apiConsole.error("[PhoneRebind] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

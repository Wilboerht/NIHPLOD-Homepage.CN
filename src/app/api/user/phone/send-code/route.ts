/**
 * 换绑手机号 - 发送验证码
 * POST /api/user/phone/send-code
 *
 * 双向验证的第一步：
 * - target=current：向当前登录手机号发码（验证身份，type=rebind-current）
 * - target=new：向新手机号发码（验证新号码所有权，type=rebind-new），
 *   新号码已注册时返回 PHONE_IN_USE（需登录态，无防枚举的假发送需求）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { rateLimit, getClientIP as getRateLimitClientIP } from "@/lib/ratelimit";
import { getClientIP } from "@/lib/client-ip";
import { sendLoginCode, generateVerifyCode, hashVerifyCode } from "@/lib/sms";
import { logAuthEvent } from "@/lib/auth-logger";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";

const sendCodeSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("current") }),
  z.object({
    target: z.literal("new"),
    newPhone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  }),
]);

// 验证码有效期（分钟）/ 发送间隔（秒）/ 每小时上限
const CODE_EXPIRE_MINUTES = 5;
const SEND_INTERVAL_SECONDS = 60;
const MAX_SEND_PER_HOUR = 5;

export const dynamic = "force-dynamic";

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  // 用户级限流：防止已登录用户高频探测手机号是否注册（枚举）或轰炸短信
  const userLimit = await rateLimit(`user:${payload.id}`, "phone-rebind");
  if (!userLimit.success) {
    return NextResponse.json(
      { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }

  // IP 频率限制（防短信轰炸）
  const ip = getRateLimitClientIP(request);
  const ipLimit = await rateLimit(ip, "form");
  if (!ipLimit.success) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "TOO_MANY_REQUESTS", message: "请求过于频繁，请稍后再试" },
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = sendCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

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
      return NextResponse.json(
        { success: false, error: { code: "SMS_UNAVAILABLE", message: "短信服务暂不可用" } },
        { status: 503 }
      );
    }

    // 当前用户手机号（发送到当前手机的标识）
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

    const { target } = parsed.data;
    let targetPhone = user.phone;
    let type = "rebind-current";

    if (target === "current") {
      // 微信占位手机号（wx_ 前缀）无短信通道：引导前端直接走新手机验证
      if (!/^1[3-9]\d{9}$/.test(user.phone)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "UNSUPPORTED_PHONE",
              message: "当前账号未绑定手机号，请直接验证新手机号后换绑",
            },
          },
          { status: 400 }
        );
      }
    }

    if (target === "new") {
      const newPhone = parsed.data.newPhone;
      if (newPhone === user.phone) {
        return NextResponse.json(
          { success: false, error: { code: "SAME_PHONE", message: "新手机号不能与当前手机号相同" } },
          { status: 400 }
        );
      }
      // 新号码已被注册则拒绝（需登录态才能走到这里，无需防枚举假发送）
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
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOO_FREQUENT", message: `请${waitSeconds}秒后重试` },
        },
        { status: 429 }
      );
    }

    // 每小时上限
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCount = await prisma.smsCode.count({
      where: { phone: targetPhone, createdAt: { gte: oneHourAgo } },
    });
    if (hourlyCount >= MAX_SEND_PER_HOUR) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "发送次数过多，请稍后再试" } },
        { status: 429 }
      );
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
        ipAddress: getClientIP(request),
      },
    });

    const smsResult = await sendLoginCode(targetPhone, code);
    if (!smsResult.success) {
      apiConsole.error("[PhoneRebind] 短信发送失败:", smsResult.error);
      await prisma.smsCode.updateMany({
        where: { phone: targetPhone, type, used: false },
        data: { used: true },
      });
      return NextResponse.json(
        { success: false, error: { code: "SMS_FAILED", message: "验证码发送失败，请稍后重试" } },
        { status: 500 }
      );
    }

    logAuthEvent("send_sms_code", {
      userId: user.id,
      identifier: targetPhone,
      success: true,
      type,
      ip: getClientIP(request),
    });

    return NextResponse.json({
      success: true,
      data: { expiresIn: CODE_EXPIRE_MINUTES * 60 },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: { code: "TOO_FREQUENT", message: "操作过于频繁，请稍后重试" } },
        { status: 429 }
      );
    }
    apiConsole.error("[PhoneRebind] send-code 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

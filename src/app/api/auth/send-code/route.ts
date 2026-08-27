/**
 * 发送短信验证码 API
 * POST /api/auth/send-code
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLoginCode, generateVerifyCode, hashVerifyCode } from "@/lib/sms";
import { z } from "zod";
import { rateLimit, getClientIP as getClientIPFromRateLimit } from "@/lib/ratelimit";
import { getClientIP } from "@/lib/client-ip";
import { logAuthEvent } from "@/lib/auth-logger";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// 请求参数验证
const sendCodeSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  // bind：小程序「关联官网账户」专用发码通道（无 Cookie 环境）
  type: z.enum(["login", "register", "reset", "bind"]).default("login"),
});

// 验证码有效期（分钟）
const CODE_EXPIRE_MINUTES = 5;
// 发送间隔（秒）
const SEND_INTERVAL_SECONDS = 60;
// 每小时最多发送次数
const MAX_SEND_PER_HOUR = 5;

/**
 * 假发送（防枚举）响应：与真实发送路径返回完全相同的响应体，
 * 避免攻击者通过响应内容区分手机号是否已注册。
 */
function fakeSendResponse() {
  return NextResponse.json(
    {
      success: true,
      data: {
        expiresIn: CODE_EXPIRE_MINUTES * 60, // 秒，与真实发送路径一致
      },
    },
    { status: 200 }
  );
}

/**
 * 模拟真实短信通道耗时。
 * 真实通道是外部 HTTP 调用（阿里云/腾讯云），正常耗时约数百 ms；
 * 假发送取 300~900ms 随机值，与真实路径同量级且区间重叠，
 * 防止通过响应时间区分手机号是否已注册（时序枚举）。
 */
async function simulateSmsSendLatency() {
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 600));
}

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. 全局 IP 频率限制 (防止大规模短信轰炸)
  const ip = getClientIPFromRateLimit(request);
  const ipLimit = await rateLimit(ip, "form"); // 使用 form 级别的限制 (1分钟10次)
  if (!ipLimit.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "请求过于频繁，请稍后再试",
        },
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();

    // 参数验证
    const result = sendCodeSchema.safeParse(body);

    // CSRF 校验：type=bind（小程序「关联官网账户」发码通道）豁免 —— 小程序无 Cookie，
    // 无法完成双提交校验。豁免前提：请求不得携带 Origin/Referer —— 小程序 wx.request
    // 不携带来源头；浏览器发起的跨站 POST（含 text/plain 简单请求）浏览器强制携带 Origin，
    // 因此携带来源头的 bind 请求仍走 CSRF 校验，杜绝跨站滥用该豁免发短信/枚举账户。
    // 豁免安全性由短信验证码本身（攻击者无法获取）+ 60 秒发送间隔 /
    // 每小时 5 次 / IP 限流保证，与 /api/auth/wechat/bind 对 bindToken 通道的豁免逻辑同理。
    // 其余 type（浏览器场景）保持强制双提交校验。
    const hasBrowserOrigin = Boolean(
      request.headers.get("origin") || request.headers.get("referer")
    );
    const csrfExempt = result.success && result.data.type === "bind" && !hasBrowserOrigin;
    if (!csrfExempt && !validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

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

    const { phone, type } = result.data;

    // 生产环境短信通道必须为真实 provider：SMS_PROVIDER 为 mock/未设置/未知值时短信
    // 实际发不出去，若返回成功会让前端谎称"验证码已发送"，用户永远等不到验证码。
    // 统一在手机号存在性判断之前短路返回 503：已注册与未注册号码得到完全相同的响应，
    // 因此假发送防枚举口径不受影响（两种存在性仍不可区分）；开发环境 mock 行为不变。
    const smsProvider = process.env.SMS_PROVIDER;
    if (
      process.env.NODE_ENV === "production" &&
      smsProvider !== "aliyun" &&
      smsProvider !== "tencent"
    ) {
      apiConsole.error(
        `[SendCode] 生产环境 SMS_PROVIDER 无效（${smsProvider ?? "未设置"}），短信服务不可用`
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SMS_UNAVAILABLE",
            message: "短信服务暂不可用",
          },
        },
        { status: 503 }
      );
    }

    // 检查发送频率
    const oneMinuteAgo = new Date(Date.now() - SEND_INTERVAL_SECONDS * 1000);
    const recentCode = await prisma.smsCode.findFirst({
      where: {
        phone,
        type,
        createdAt: { gte: oneMinuteAgo },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentCode) {
      const waitSeconds = Math.ceil(
        (recentCode.createdAt.getTime() + SEND_INTERVAL_SECONDS * 1000 - Date.now()) / 1000
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TOO_FREQUENT",
            message: `请${waitSeconds}秒后重试`,
          },
        },
        { status: 429 }
      );
    }

    // 检查每小时发送次数
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCount = await prisma.smsCode.count({
      where: {
        phone,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (hourlyCount >= MAX_SEND_PER_HOUR) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "发送次数过多，请稍后再试",
          },
        },
        { status: 429 }
      );
    }

    // 手机号业务规则校验（防止短信滥用）
    const userExists = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (type === "register" && userExists) {
      // 模拟短信发送耗时，防止时序泄露用户存在性
      await simulateSmsSendLatency();
      return fakeSendResponse();
    }

    if (type === "login" && !userExists) {
      await simulateSmsSendLatency();
      return fakeSendResponse();
    }

    if (type === "reset" && !userExists) {
      await simulateSmsSendLatency();
      return fakeSendResponse();
    }

    // 绑定场景（小程序「关联官网账户」）：仅手机号已存在官网账户才真实发码；
    // 未注册手机号假发送（返回成功但不发码），防枚举口径与 register/login/reset 一致
    if (type === "bind" && !userExists) {
      await simulateSmsSendLatency();
      return fakeSendResponse();
    }

    // 生成验证码
    const code = generateVerifyCode();
    if (process.env.NODE_ENV === "development") {
      apiConsole.debug(`[DEV-SMS] 手机: ${phone} | 类型: ${type} | 验证码: ${code}`);
    }
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);
    const codeHash = hashVerifyCode(phone, code, type);

    // 将同 phone+type 的旧未使用验证码标记为已使用（确保 partial unique index 约束）
    await prisma.smsCode.updateMany({
      where: { phone, type, used: false },
      data: { used: true },
    });

    // 先入库再发短信：入库占用 slot，阻止并发请求通过冷却检查
    // 入库失败（唯一约束冲突）说明并发请求已占用，这是正确的竞态防护
    await prisma.smsCode.create({
      data: {
        phone,
        codeHash,
        type,
        expiresAt,
        ipAddress: getClientIP(request),
      },
    });

    // 发送短信
    const smsResult = await sendLoginCode(phone, code);

    if (!smsResult.success) {
      // 短信发送失败，清理已入库的验证码（避免脏数据）
      apiConsole.error("[SendCode] 短信发送失败:", smsResult.error);
      await prisma.smsCode.updateMany({
        where: { phone, type, used: false },
        data: { used: true },
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SMS_FAILED",
            message: "验证码发送失败，请稍后重试",
          },
        },
        { status: 500 }
      );
    }

    logAuthEvent("send_sms_code", {
      identifier: phone,
      success: true,
      type,
      ip: getClientIP(request),
    });

    return NextResponse.json({
      success: true,
      data: {
        expiresIn: CODE_EXPIRE_MINUTES * 60, // 秒
      },
    });
  } catch (error) {
    // 并发请求导致的唯一约束冲突 → 返回友好提示（并发请求中只有一个能成功）
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TOO_FREQUENT",
            message: "操作过于频繁，请稍后重试",
          },
        },
        { status: 429 }
      );
    }
    apiConsole.error("[SendCode] 异常:", error);
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

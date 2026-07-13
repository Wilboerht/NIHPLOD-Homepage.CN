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
  type: z.enum(["login", "register", "reset"]).default("login"),
});

// 验证码有效期（分钟）
const CODE_EXPIRE_MINUTES = 5;
// 发送间隔（秒）
const SEND_INTERVAL_SECONDS = 60;
// 每小时最多发送次数
const MAX_SEND_PER_HOUR = 5;

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
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
    const body = await request.json();

    // 参数验证
    const result = sendCodeSchema.safeParse(body);
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
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PHONE_EXISTS",
            message: "该手机号已注册，请直接登录",
          },
        },
        { status: 400 }
      );
    }

    if (type === "login" && !userExists) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "该手机号未注册，请先注册账户",
          },
        },
        { status: 400 }
      );
    }

    if (type === "reset" && !userExists) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CODE_SENT",
            message: "验证码已发送（如手机号已注册）",
          },
        },
        { status: 200 }
      );
    }

    // 生成验证码
    const code = generateVerifyCode();
    console.log(`[DEBUG-SMS] 📱 ${phone} | 类型: ${type} | 验证码: ${code}`);
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


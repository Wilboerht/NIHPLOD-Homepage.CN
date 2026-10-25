/**
 * POST /api/oauth/account/deletion/send-code
 *
 * OAuth 账号注销二次验证码。OAuth 用户（小程序）密码通常由注册时自动生成且不可知，
 * 因此注销前必须用本人手机号接收一次性短信验证码，避免仅凭长期 Bearer token
 * 即可发起不可逆的账号注销。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import {
  generateVerifyCode,
  hashVerifyCode,
  sendLoginCode,
} from "@/lib/sms";
import { maskPhone } from "@/lib/mask-phone";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const WRITE_SCOPE = "profile:write";
const CODE_EXPIRE_MINUTES = 5;
const SEND_INTERVAL_SECONDS = 60;
const MAX_SEND_PER_HOUR = 5;

export async function POST(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  const resJson = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store", ...corsHeaders },
    });

  try {
    const auth = await authenticateOAuthUserRequest(request, "POST", {
      scope: WRITE_SCOPE,
      action: "account_deletion_send_code",
    });
    if (!auth.ok) return auth.response;
    const { payload, ip } = auth;

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { phone: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      return resJson(
        { success: false, error: { code: "ACCOUNT_NOT_ACTIVE", message: "账号状态异常" } },
        403
      );
    }

    const userLimit = await rateLimit(`user:${payload.id}`, "account-deletion-code");
    if (!userLimit.success) {
      return resJson(
        { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁" } },
        429
      );
    }

    const oneMinuteAgo = new Date(Date.now() - SEND_INTERVAL_SECONDS * 1000);
    const recent = await prisma.smsCode.findFirst({
      where: {
        phone: user.phone,
        type: "deletion",
        createdAt: { gte: oneMinuteAgo },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return resJson(
        { success: false, error: { code: "TOO_FREQUENT", message: "发送过于频繁，请稍后再试" } },
        429
      );
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCount = await prisma.smsCode.count({
      where: { phone: user.phone, createdAt: { gte: oneHourAgo } },
    });
    if (hourlyCount >= MAX_SEND_PER_HOUR) {
      return resJson(
        { success: false, error: { code: "RATE_LIMITED", message: "发送次数过多，请稍后再试" } },
        429
      );
    }

    const code = generateVerifyCode();
    const codeHash = hashVerifyCode(user.phone, code, "deletion");
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);

    await prisma.smsCode.updateMany({
      where: { phone: user.phone, type: "deletion", used: false },
      data: { used: true },
    });
    await prisma.smsCode.create({
      data: {
        phone: user.phone,
        codeHash,
        type: "deletion",
        expiresAt,
        ipAddress: ip,
      },
    });

    const smsResult = await sendLoginCode(user.phone, code);
    if (!smsResult.success) {
      await prisma.smsCode.deleteMany({
        where: { phone: user.phone, type: "deletion", used: false },
      });
      return resJson(
        { success: false, error: { code: "SMS_FAILED", message: "验证码发送失败，请稍后重试" } },
        500
      );
    }

    apiConsole.info(`[OAuth AccountDeletion] 已发送注销验证码 phone=${maskPhone(user.phone)}`);
    return resJson({ success: true, data: { expiresIn: CODE_EXPIRE_MINUTES * 60 } });
  } catch (error) {
    apiConsole.error("[OAuth AccountDeletion] 发送验证码异常:", error);
    return resJson(
      { success: false, error: { code: "SERVER_ERROR", message: "服务器内部错误" } },
      500
    );
  }
}

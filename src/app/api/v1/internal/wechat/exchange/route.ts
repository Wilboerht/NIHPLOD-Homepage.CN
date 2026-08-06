/**
 * 内部 API v1：子站微信授权信息兑换（跨域场景）
 * POST /api/v1/internal/wechat/exchange
 *
 * 解决子站无法读取官网 __Host-wechat_bind_token Cookie 的问题：
 * 官网微信回调把微信用户信息打包成短期签名 JWT（wechat_exchange_token）通过 URL 传给子站，
 * 子站凭此 token 调用本接口完成用户查找/创建/绑定，并获取登录凭证。
 *
 * 认证方式：与 /api/v1/internal/wechat/send-template 一致的 HMAC-SHA256 签名。
 *
 * Body：
 *   wechatExchangeToken: string  （必填，官网回调下发的 exchange token）
 *   phone?: string              （可选，手机号）
 *   code?: string               （可选，短信验证码）
 *   password?: string           （可选，绑定手机号时使用的密码）
 *   allowAutoPassword?: boolean （可选，未提供密码时是否自动生成，默认 false，需前端显式传 true）
 *
 * 响应：
 *   success: true
 *   data: {
 *     user: { id, phone, nickname, avatar },
 *     accessToken: string,
 *     refreshToken: string,
 *     bindingRequired: boolean,
 *     message?: string,
 *     passwordGenerated?: boolean,
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import {
  verifyInternalApiSignature,
  isTimestampValid,
  checkAndRecordNonce,
  hashRequestBody,
} from "@/lib/internal-api";
import {
  signUserToken,
  signRefreshToken,
  verifyWechatExchangeToken,
  markWechatExchangeTokenUsed,
} from "@/lib/jwt";
import { saveRefreshToken, extractDeviceInfo } from "@/lib/auth-security";
import { checkUserStatus } from "@/lib/auth";
import { passwordSchema } from "@/lib/password";
import { resolveWechatBinding } from "@/lib/wechat-binding";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";

const exchangeSchema = z.object({
  wechatExchangeToken: z.string().min(1, "缺少微信授权 exchange token"),
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, "请输入正确的手机号")
    .optional(),
  code: z
    .string()
    .regex(/^\d{6}$/, "验证码为6位数字")
    .optional(),
  password: passwordSchema.optional(),
  allowAutoPassword: z.boolean().default(false),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. IP 速率限制
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 60, windowMs: 60 * 1000 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
        { status: 429 }
      );
    }

    // 2. 读取并校验鉴权头
    const key = request.headers.get("x-internal-api-key");
    const signature = request.headers.get("x-internal-api-signature");
    const timestampHeader = request.headers.get("x-internal-api-timestamp");
    const nonce = request.headers.get("x-internal-api-nonce");

    if (!key || !signature || !timestampHeader || !nonce) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_AUTH", message: "缺少鉴权头" } },
        { status: 401 }
      );
    }

    const timestamp = parseInt(timestampHeader, 10);
    if (Number.isNaN(timestamp) || !isTimestampValid(timestamp)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TIMESTAMP", message: "请求时间戳无效或已过期" } },
        { status: 401 }
      );
    }

    if (!(await checkAndRecordNonce(nonce))) {
      return NextResponse.json(
        { success: false, error: { code: "REPLAY_ATTACK", message: "重复的请求 nonce" } },
        { status: 401 }
      );
    }

    // 3. 读取 body 并校验签名
    const bodyText = await request.text();
    const bodyHash = await hashRequestBody(bodyText);
    const path = "/api/v1/internal/wechat/exchange";

    const config = verifyInternalApiSignature(
      key,
      signature,
      "POST",
      path,
      timestamp,
      nonce,
      bodyHash
    );

    if (!config) {
      apiConsole.warn(`[InternalApiV1] 签名验证失败，key: ${key}, ip: ${ip}`);
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "签名验证失败" } },
        { status: 401 }
      );
    }

    // 4. 解析业务参数
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_JSON", message: "请求体不是合法 JSON" } },
        { status: 400 }
      );
    }

    const parsed = exchangeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { wechatExchangeToken, phone, code, password, allowAutoPassword } = parsed.data;

    // 5. 验证 exchange token
    const wechatInfo = await verifyWechatExchangeToken(wechatExchangeToken);
    if (!wechatInfo) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_EXCHANGE_TOKEN", message: "微信授权已过期或无效，请重新扫码" },
        },
        { status: 400 }
      );
    }

    // 6. 查找现有微信用户
    const oldWechatUser = await prisma.user.findFirst({
      where: wechatInfo.unionid
        ? { OR: [{ wechatUnionId: wechatInfo.unionid }, { wechatOpenId: wechatInfo.openid }] }
        : { wechatOpenId: wechatInfo.openid },
    });

    // 7. 如果提供了手机号和验证码，执行绑定流程
    if (phone && code) {
      const bindingResult = await resolveWechatBinding({
        phone,
        code,
        password,
        allowAutoPassword,
        wechatInfo,
        request,
      });

      if (!bindingResult.success) {
        return NextResponse.json(
          { success: false, error: { code: bindingResult.code, message: bindingResult.message } },
          { status: bindingResult.code === "ACCOUNT_DISABLED" ? 403 : 400 }
        );
      }

      await markWechatExchangeTokenUsed(wechatExchangeToken);
      return NextResponse.json({
        success: true,
        data: {
          ...bindingResult.data,
          bindingRequired: false,
        },
      });
    }

    // 8. 未提供手机号：检查该微信是否已绑定有效账户
    if (!oldWechatUser || oldWechatUser.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
      return NextResponse.json(
        {
          success: true,
          data: {
            bindingRequired: true,
            user: null,
            accessToken: null,
            refreshToken: null,
          },
        },
        { status: 200 }
      );
    }

    // 9. 已绑定有效账户，直接登录
    const result = await finalizeLogin(
      oldWechatUser,
      wechatInfo,
      false,
      request,
      wechatExchangeToken
    );
    return result;
  } catch (error) {
    apiConsole.error("[InternalApiV1] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

async function finalizeLogin(
  user: {
    id: string;
    phone: string;
    nickname: string | null;
    avatar: string | null;
  },
  wechatInfo: {
    openid: string;
    unionid?: string;
    nickname?: string;
    avatar?: string;
  },
  passwordGenerated: boolean,
  request: NextRequest,
  exchangeToken?: string
) {
  // 校验账号状态
  const statusCheck = await checkUserStatus(user.id);
  if (!statusCheck.valid) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "ACCOUNT_DISABLED", message: statusCheck.reason || "账号状态异常" },
      },
      { status: 403 }
    );
  }

  // 更新微信信息
  await prisma.user.update({
    where: { id: user.id },
    data: {
      wechatOpenId: wechatInfo.openid,
      wechatUnionId: wechatInfo.unionid || undefined,
      nickname: user.nickname || wechatInfo.nickname || null,
      avatar: user.avatar || wechatInfo.avatar || null,
    },
  });

  // 签发双 Token
  const accessToken = await signUserToken({ id: user.id, phone: user.phone });
  const refreshToken = await signRefreshToken({ id: user.id, phone: user.phone });
  const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await saveRefreshToken(user.id, refreshToken, refreshTokenExpiresAt, extractDeviceInfo(request));

  logAuthEvent("user_login", {
    userId: user.id,
    identifier: user.phone,
    success: true,
    method: "wechat",
    ip: getClientIP(request),
  });

  if (exchangeToken) {
    await markWechatExchangeTokenUsed(exchangeToken);
  }

  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
      },
      accessToken,
      refreshToken,
      bindingRequired: false,
      passwordGenerated,
      message: passwordGenerated
        ? "绑定成功，已自动登录。系统已为您生成安全密码，可在个人信息中修改"
        : "绑定成功，已自动登录",
    },
  });
}

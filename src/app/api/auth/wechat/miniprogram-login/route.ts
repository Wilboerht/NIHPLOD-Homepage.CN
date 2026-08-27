/**
 * 微信小程序登录
 * POST /api/auth/wechat/miniprogram-login
 *
 * Body: { code: string }（wx.login 产物）
 *
 * 流程：code2session 换 openid/unionid → 按 ExternalIdentity（provider=wechat_miniprogram）
 * 或 UnionID 聚合查找用户 → 三分支：
 * 1. 已绑定真实账户且状态正常 → 签发双 Token，JSON 响应体携带（小程序无 Cookie）
 * 2. 占位账户/未绑定 → 返回 bindToken，前端引导手机+验证码绑定
 *    （POST /api/auth/wechat/bind，body 携带 bindToken）
 * 3. 封禁/冻结 → 403 ACCOUNT_DISABLED
 *
 * 安全说明：
 * - 不启用 CSRF 校验：小程序为无浏览器环境，无 __Host- Cookie 双端比对能力；
 *   凭证为微信服务端签发的一次性 code，配合 IP 限流防爆破
 * - session_key 由 code2session 返回后立即丢弃，不落库、不下发、不记录日志
 * - 手机号绑定统一走 SMS 验证码（不使用微信手机号快速验证组件，避免 session_key 解密攻击面）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { code2session, getMiniprogramPhone } from "@/lib/wechat";
import {
  signUserToken,
  signRefreshToken,
  signWechatBindToken,
  type WechatBindPayload,
} from "@/lib/jwt";
import { saveRefreshToken, extractDeviceInfo } from "@/lib/auth-security";
import { findUserByIdentity, findUserByUnionId, upsertIdentity } from "@/lib/external-identity";
import { resolveWechatBinding } from "@/lib/wechat-binding";
import { checkUserStatus } from "@/lib/auth";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { logAuthEvent } from "@/lib/auth-logger";
import { apiConsole } from "@/lib/logger";

const PROVIDER = "wechat_miniprogram";

const bodySchema = z.object({
  // wx.login code 为短时效一次性凭证，限制长度防异常输入
  code: z.string().min(1).max(256),
  // getPhoneNumber 按钮授权码（可选）：携带时一步完成登录+手机号绑定
  phoneCode: z.string().min(1).max(256).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  // IP 速率限制（防 code 爆破，与 wechat-bind 口径一致）
  const ipLimit = await rateLimit(clientIP, "wechat-miniprogram");
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
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误" },
        },
        { status: 400 }
      );
    }

    // 1. code 换 openid/unionid
    let session;
    try {
      session = await code2session(parsed.data.code);
    } catch (error) {
      apiConsole.error("[MiniprogramLogin] code2session 失败:", error);
      return NextResponse.json(
        {
          success: false,
          error: { code: "WECHAT_AUTH_FAILED", message: "微信登录失败，请重试" },
        },
        { status: 401 }
      );
    }
    // session_key 立即丢弃：不解密手机号、不落库、不进日志
    const { openid, unionid } = session;

    // 1.5 一键登录：携带 phoneCode 时，微信已证明手机号归属，
    //     直接复用绑定核心逻辑完成 查找/创建/合并 + 双 Token 签发，无需短信验证码
    if (parsed.data.phoneCode) {
      let wxPhone: string;
      try {
        wxPhone = await getMiniprogramPhone(parsed.data.phoneCode);
      } catch (error) {
        apiConsole.error("[MiniprogramLogin] getPhoneNumber 换取失败:", error);
        return NextResponse.json(
          {
            success: false,
            error: { code: "PHONE_CODE_FAILED", message: "获取微信手机号失败，请重试或使用验证码绑定" },
          },
          { status: 400 }
        );
      }
      if (!/^1[3-9]\d{9}$/.test(wxPhone)) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "PHONE_INVALID", message: "微信手机号格式异常，请使用验证码绑定" },
          },
          { status: 400 }
        );
      }

      const wechatInfo: WechatBindPayload = {
        type: "wechat_bind",
        openid,
        unionid,
        provider: PROVIDER,
      };
      const bindingResult = await resolveWechatBinding({
        phone: wxPhone,
        wxVerifiedPhone: wxPhone,
        allowAutoPassword: true,
        wechatInfo,
        request,
        provider: PROVIDER,
      });

      if (!bindingResult.success) {
        return NextResponse.json(
          { success: false, error: { code: bindingResult.code, message: bindingResult.message } },
          { status: bindingResult.code === "ACCOUNT_DISABLED" ? 403 : 400 }
        );
      }

      const { user, accessToken, refreshToken, passwordGenerated, message } = bindingResult.data;
      logAuthEvent("user_login", {
        userId: user.id,
        identifier: user.phone,
        success: true,
        method: "wechat_miniprogram_one_step",
        ip: clientIP,
      });

      return NextResponse.json({
        success: true,
        data: {
          needBinding: false,
          accessToken,
          refreshToken,
          user,
          passwordGenerated,
          message,
        },
      });
    }

    // 2. 查找用户：先按本 provider 身份，再按 UnionID 聚合（限定微信系，避免与抖音等他系 unionid 串扰；兼容历史 wechat 列）
    let user = await findUserByIdentity(PROVIDER, openid);
    if (!user && unionid) {
      user = await findUserByUnionId(unionid, ["wechat_open", "wechat_mp", "wechat_miniprogram"]);
    }
    if (!user && unionid) {
      user = await prisma.user.findFirst({ where: { wechatUnionId: unionid } });
    }
    if (!user) {
      user = await prisma.user.findFirst({ where: { wechatOpenId: openid } });
    }

    // 3. 未绑定或占位账户 → 返回绑定令牌
    if (!user || user.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
      logAuthEvent("wechat_bind", {
        success: false,
        step: "miniprogram_binding_required",
        ip: clientIP,
      });
      const bindToken = await signWechatBindToken({ openid, unionid, provider: PROVIDER });
      return NextResponse.json({
        success: true,
        data: { needBinding: true, bindToken },
      });
    }

    // 4. 状态校验（封禁/冻结拒绝）
    const statusCheck = await checkUserStatus(user.id);
    if (!statusCheck.valid) {
      logAuthEvent("user_login", {
        userId: user.id,
        identifier: user.phone,
        success: false,
        method: "wechat_miniprogram",
        reason: statusCheck.reason,
        ip: clientIP,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: "ACCOUNT_DISABLED", message: statusCheck.reason || "账号状态异常" },
        },
        { status: 403 }
      );
    }

    // 5. 双写 ExternalIdentity（unionid 聚合后 openid 归属到已有账户）+ UnionID 补写，同事务保证一致性
    await prisma.$transaction(async (tx) => {
      await upsertIdentity(user.id, PROVIDER, openid, unionid || user.wechatUnionId, undefined, tx);
      if (unionid && !user.wechatUnionId) {
        await tx.user.update({
          where: { id: user.id },
          data: { wechatUnionId: unionid },
        });
      }
    });

    // 6. 签发双 Token（access 携带 jti，登出即失效自动生效）
    const accessToken = await signUserToken({ id: user.id });
    const refreshToken = await signRefreshToken({ id: user.id });
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await saveRefreshToken(user.id, refreshToken, refreshTokenExpiresAt, extractDeviceInfo(request));

    logAuthEvent("user_login", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      method: "wechat_miniprogram",
      ip: clientIP,
    });

    return NextResponse.json({
      success: true,
      data: {
        needBinding: false,
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
        },
      },
    });
  } catch (error) {
    apiConsole.error("[MiniprogramLogin] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

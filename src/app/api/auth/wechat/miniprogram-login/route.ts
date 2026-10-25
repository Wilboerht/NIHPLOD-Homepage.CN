/**
 * 微信小程序登录（多小程序共用）
 * POST /api/auth/wechat/miniprogram-login
 *
 * Body: { code: string, phoneCode?: string, clientId?: string }
 *   - code：wx.login 产物（必填）
 *   - phoneCode：getPhoneNumber 按钮授权码（可选，携带时一步完成登录+手机号绑定）
 *   - clientId：来源小程序客户端（可选，缺省 wechat-mp-skin）。需同时在
 *     MINIPROGRAM_CLIENTS 配置该 client 的微信凭证（appId/secret），并在 SSO 后台
 *     建有同名 public OAuth Client（scopes 需覆盖 openid profile phone membership
 *     profile:write birthday）
 *
 * 流程：code2session（按 clientId 对应凭证）换 openid/unionid → 按 ExternalIdentity
 * （provider=wechat_miniprogram）或 UnionID 聚合查找用户 → 三分支：
 * 1. 已绑定真实账户且状态正常 → 签发 OAuth 双 Token（access token 为 RS256，
 *    audience=clientId，子站可经 JWKS 验签），JSON 响应体携带（小程序无 Cookie）
 * 2. 占位账户/未绑定 → 返回 bindToken（载荷含 mpClientId），前端引导手机+验证码绑定
 *    （POST /api/auth/wechat/bind，body 携带 bindToken）
 * 3. 封禁/冻结 → 403 ACCOUNT_DISABLED
 *
 * Token 刷新：小程序端 refresh token 走 POST /api/oauth/token 的 refresh_token grant
 * （client_id=对应小程序 clientId，public client 免 secret）；本端点只负责登录签发，
 * 旧的 /api/auth/wechat/miniprogram-refresh 继续服务存量 HS256 token，不在此改动。
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
import { signWechatBindToken, type WechatBindPayload } from "@/lib/jwt";
import { findUserByIdentity, findUserByUnionId, upsertIdentity } from "@/lib/external-identity";
import { resolveWechatBinding, issueOAuthTokens } from "@/lib/wechat-binding";
import {
  DEFAULT_MINIPROGRAM_CLIENT_ID,
  resolveMiniprogramCredentials,
} from "@/lib/miniprogram-clients";
import { getOAuthClientByClientId } from "@/lib/oauth-client";
import { checkUserStatus } from "@/lib/auth";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { BODY_LIMITS } from "@/lib/body-limits";
import {
  isBodyTooLargeError,
  payloadTooLargeResponse,
  readJsonBody,
} from "@/lib/request-body";
import { logAuthEvent } from "@/lib/auth-logger";
import { apiConsole } from "@/lib/logger";

const PROVIDER = "wechat_miniprogram";

// 小程序登录所需 scope（实际签发 = 本集合 ∩ OAuthClient.scopes）
// profile:write：资料编辑（PATCH /api/oauth/userinfo，昵称/头像）；birthday：生日回显
const MP_OAUTH_SCOPE = "openid profile phone membership profile:write birthday";

/**
 * 读取指定小程序 OAuth Client。缺失/停用/非 public 属部署配置错误：
 * 打明确错误日志并返回 null，调用方以 500 响应（日志中提示需先建 client）。
 */
async function requireMpOAuthClient(clientId: string) {
  const client = await getOAuthClientByClientId(clientId);
  if (!client || !client.isActive) {
    apiConsole.error(
      `[MiniprogramLogin] OAuth Client "${clientId}" 不存在或已停用，` +
        `请先在 SSO 后台创建该 client（scopes 需覆盖: ${MP_OAUTH_SCOPE}）`
    );
    return null;
  }
  // 小程序无 secret 持有能力，refresh grant 依赖 public client 免 secret；
  // confidential client 会在 POST /api/oauth/token 的 refresh_token grant 上 401
  if (!client.isPublic) {
    apiConsole.error(
      `[MiniprogramLogin] OAuth Client "${clientId}" 不是 public client，` +
        `必须建为 public client，否则 refresh grant 会 401`
    );
    return null;
  }
  const missingScopes = MP_OAUTH_SCOPE.split(" ").filter((s) => !client.scopes.includes(s));
  if (missingScopes.length > 0) {
    apiConsole.warn(
      `[MiniprogramLogin] OAuth Client "${clientId}" 的 scopes 未覆盖: ${missingScopes.join(" ")}`
    );
  }
  return client;
}

/**
 * 计算实际签发 scope：MP_OAUTH_SCOPE ∩ client.scopes（保持 MP_OAUTH_SCOPE 的顺序）。
 * 交集为空属配置错误：打 error 日志并返回 null，调用方以 500 响应。
 */
function resolveMpScope(clientId: string, client: { scopes: string[] }): string | null {
  const granted = MP_OAUTH_SCOPE.split(" ").filter((s) => client.scopes.includes(s));
  if (granted.length === 0) {
    apiConsole.error(
      `[MiniprogramLogin] OAuth Client "${clientId}" 的 scopes（${client.scopes.join(" ") || "(空)"}）` +
        `与小程序所需 scope（${MP_OAUTH_SCOPE}）无交集，请在 SSO 后台补齐 client scopes`
    );
    return null;
  }
  return granted.join(" ");
}

function oauthClientMissingResponse() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "OAUTH_CLIENT_MISSING", message: "登录服务配置异常，请稍后再试" },
    },
    { status: 500 }
  );
}

const bodySchema = z.object({
  // wx.login code 为短时效一次性凭证，限制长度防异常输入
  code: z.string().min(1).max(256),
  // getPhoneNumber 按钮授权码（可选）：携带时一步完成登录+手机号绑定
  phoneCode: z.string().min(1).max(256).optional(),
  // 来源小程序客户端（可选，缺省 wechat-mp-skin；需在 MINIPROGRAM_CLIENTS 配置凭证）
  clientId: z.string().min(1).max(64).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  // IP 速率限制（防 code 爆破，与 wechat-bind 口径一致；全小程序共用桶）
  const ipLimit = await rateLimit(clientIP, "miniprogram-login");
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
    const body = await readJsonBody(request, BODY_LIMITS.authJson);
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

    const { code, phoneCode, clientId = DEFAULT_MINIPROGRAM_CLIENT_ID } = parsed.data;

    // 多小程序凭证：按 clientId 解析（缺省客户端回退旧版单小程序变量）
    const credentials = resolveMiniprogramCredentials(clientId);
    if (!credentials) {
      apiConsole.warn(`[MiniprogramLogin] 未配置的小程序客户端: ${clientId}`);
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNKNOWN_CLIENT", message: "未配置的小程序客户端" },
        },
        { status: 400 }
      );
    }

    // 1. code 换 openid/unionid
    let session;
    try {
      session = await code2session(code, credentials);
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
    if (phoneCode) {
      let wxPhone: string;
      try {
        wxPhone = await getMiniprogramPhone(phoneCode, credentials);
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

      const mpClient = await requireMpOAuthClient(clientId);
      if (!mpClient) return oauthClientMissingResponse();
      const mpScope = resolveMpScope(clientId, mpClient);
      if (!mpScope) return oauthClientMissingResponse();

      const wechatInfo: WechatBindPayload = {
        type: "wechat_bind",
        openid,
        unionid,
        provider: PROVIDER,
        // 来源小程序：写入 ExternalIdentity.metadata，供管理端展示"哪个小程序"绑定
        mpClientId: clientId,
      };
      const bindingResult = await resolveWechatBinding({
        phone: wxPhone,
        wxVerifiedPhone: wxPhone,
        allowAutoPassword: true,
        wechatInfo,
        request,
        provider: PROVIDER,
        oauth: {
          clientId,
          scope: mpScope,
          accessTokenTtlSeconds: mpClient.accessTokenTtlSeconds,
        },
      });

      if (!bindingResult.success) {
        return NextResponse.json(
          { success: false, error: { code: bindingResult.code, message: bindingResult.message } },
          { status: bindingResult.code === "ACCOUNT_DISABLED" ? 403 : 400 }
        );
      }

      const { user, accessToken, refreshToken, expiresIn, passwordGenerated, message } =
        bindingResult.data;
      logAuthEvent("user_login", {
        userId: user.id,
        identifier: user.phone,
        success: true,
        method: "wechat_miniprogram_one_step",
        clientId,
        ip: clientIP,
      });

      return NextResponse.json({
        success: true,
        data: {
          needBinding: false,
          // OAuth 口径：accessToken 为 RS256（aud=clientId），expiresIn 为其有效期秒数
          // （= OAuthClient.accessTokenTtlSeconds）；refreshToken 有效期固定 30 天，
          // 刷新走 POST /api/oauth/token 的 refresh_token grant
          accessToken,
          refreshToken,
          expiresIn,
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
        clientId,
        ip: clientIP,
      });
      const bindToken = await signWechatBindToken({
        openid,
        unionid,
        provider: PROVIDER,
        mpClientId: clientId,
      });
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
        clientId,
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

    // 5. 双写 ExternalIdentity（unionid 聚合后 openid 归属到已有账户）+ UnionID 补写，同事务保证一致性；
    //    metadata 同步回填来源小程序（存量行无该字段，登录时自愈），小程序渠道不采集昵称/头像
    await prisma.$transaction(async (tx) => {
      await upsertIdentity(
        user.id,
        PROVIDER,
        openid,
        unionid || user.wechatUnionId,
        {
          nickname: null,
          avatar: null,
          mpClientId: clientId,
          mpAppId: credentials.appId,
        },
        tx
      );
      if (unionid && !user.wechatUnionId) {
        await tx.user.update({
          where: { id: user.id },
          data: { wechatUnionId: unionid },
        });
      }
    });

    // 6. 签发 OAuth 双 Token：RS256 access token（aud=clientId，携带 sid；
    //    撤销 OAuthSession 后主站 verifyOAuthAccessToken/introspect 立即失效，
    //    子站 JWKS 本地验签不感知撤销，靠短 TTL 兜底）；refresh token 关联 client_id/scope/sid。
    //    scope 收窄为 MP_OAUTH_SCOPE ∩ client.scopes；
    //    access token 有效期取 OAuthClient.accessTokenTtlSeconds（响应 expiresIn 字段），
    //    refresh token 30 天硬上限；小程序端刷新走 POST /api/oauth/token 的 refresh_token grant
    const mpClient = await requireMpOAuthClient(clientId);
    if (!mpClient) return oauthClientMissingResponse();
    const mpScope = resolveMpScope(clientId, mpClient);
    if (!mpScope) return oauthClientMissingResponse();
    const { accessToken, refreshToken, expiresIn } = await issueOAuthTokens(
      { id: user.id, phone: user.phone },
      {
        clientId,
        scope: mpScope,
        accessTokenTtlSeconds: mpClient.accessTokenTtlSeconds,
      },
      request
    );

    logAuthEvent("user_login", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      method: "wechat_miniprogram",
      clientId,
      ip: clientIP,
    });

    return NextResponse.json({
      success: true,
      data: {
        needBinding: false,
        accessToken,
        refreshToken,
        expiresIn,
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
        },
      },
    });
  } catch (error) {
    if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
    apiConsole.error("[MiniprogramLogin] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

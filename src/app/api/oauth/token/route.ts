/**
 * OAuth 2.0 Token 端点
 * POST /api/oauth/token
 *
 * 支持 grant_type:
 * - authorization_code: 授权码兑换 Access Token + Refresh Token + ID Token
 * - refresh_token: 刷新 Access Token
 *
 * 安全特性:
 * - PKCE code_verifier 校验
 * - 授权码一次性使用（原子化消费）
 * - client_secret 认证（bcrypt）
 * - client_secret_basic（Authorization: Basic ...）
 * - Refresh Token 原子化轮换（复用 atomicallyRotateRefreshToken）
 * - CORS：仅允许已注册 redirect_uri 的 origin
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { getClientCredentials } from "@/lib/oauth-client-auth";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { consumeAuthorizationCode, verifyPKCE } from "@/lib/oauth-code";
import {
  signOAuthAccessToken,
  signIdToken,
  signRefreshToken,
  verifyRefreshToken,
  getExpiresInFromToken,
  computeAtHash,
  type IdTokenClaims,
} from "@/lib/jwt";
import { atomicallyRotateRefreshToken, extractDeviceInfo, saveRefreshToken } from "@/lib/auth-security";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { recordLoginAttempt } from "@/lib/auth-security";
import { maskPhone } from "@/lib/mask-phone";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";
import { OIDC_IMPLICIT_SCOPES } from "@/lib/oauth-constants";
import { validateDPoPProof, computeDPoPAth, dpopNonceHeader } from "@/lib/dpop";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Access Token 默认有效期（秒）：15 分钟，client 可自定义覆盖 */
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = 900;

export async function POST(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  const resJson = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
    NextResponse.json(body, { status, headers: { ...corsHeaders, ...extraHeaders } });

  try {
    const ip = getClientIP(request);

    // 读取 body（支持 JSON 和 form-urlencoded）— 提前解析以满足 client 级限流需要
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, string>;

    if (contentType.includes("application/json")) {
      const json = await request.json();
      body = json;
    } else {
      const formData = await request.formData();
      body = {};
      formData.forEach((v, k) => { body[k] = v.toString(); });
    }

    // 限流：client_id 级优先，IP 级兜底（避免同 IP 下多子项目互相影响）
    const client_id_from_req = body.client_id || getClientCredentials(request, body).client_id;
    if (client_id_from_req) {
      const clientLimitResult = await rateLimit(`client:${client_id_from_req}`, "oauth-token");
      if (!clientLimitResult.success) {
        return resJson(
          { error: "rate_limited", error_description: "子项目请求过于频繁" },
          429
        );
      }
    }

    const limitResult = await rateLimit(ip, "oauth-token");
    if (!limitResult.success) {
      return resJson(
        { error: "rate_limited", error_description: "请求过于频繁" },
        429
      );
    }

    const grant_type = body.grant_type;
    const { client_id, client_secret } = getClientCredentials(request, body);

    if (!client_id) {
      return resJson(
        { error: "invalid_client", error_description: "缺少 client_id" },
        401
      );
    }

    // 验证 client（Public Client 可不传 client_secret）
    const verifyResult = await verifyOAuthClientSecret(client_id, client_secret, { allowPublic: true });
    if (!verifyResult.client) {
      const reason = verifyResult.reason;
      recordSsoEvent({
        event: "token",
        clientId: client_id,
        ip,
        success: false,
        detail: { grant_type, reason: reason },
      });
      if (reason === "disabled") {
        return resJson(
          { error: "unauthorized_client", error_description: "Client 已被停用" },
          401
        );
      }
      return resJson(
        { error: "invalid_client", error_description: "Client 认证失败" },
        401
      );
    }
    const client = verifyResult.client;

    // Confidential Client 必须提供 client_secret
    if (!client.isPublic && !client_secret) {
      recordSsoEvent({
        event: "token",
        clientId: client_id,
        clientName: client.name,
        ip,
        success: false,
        detail: { grant_type, reason: "missing_client_secret" },
      });
      return resJson(
        { error: "invalid_client", error_description: "Confidential Client 必须提供 client_secret" },
        401
      );
    }

    // === grant_type: authorization_code ===
    if (grant_type === "authorization_code") {
      const code = body.code;
      const code_verifier = body.code_verifier;

      if (!code) {
        return resJson(
          { error: "invalid_grant", error_description: "缺少 authorization code" },
          400
        );
      }

      // 消费授权码（原子化）
      const codeData = await consumeAuthorizationCode(code);
      if (!codeData) {
        recordSsoEvent({
          event: "token",
          userId: undefined,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type, reason: "code_used_or_not_found" },
        });
        return resJson(
          { error: "invalid_grant", error_description: "Authorization code 无效或已被使用" },
          400
        );
      }

      // 校验 client_id 与授权码一致
      if (codeData.clientId !== client_id) {
        recordSsoEvent({
          event: "token",
          userId: codeData.userId,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type, reason: "client_id_mismatch", expected: codeData.clientId },
        });
        return resJson(
          { error: "invalid_grant", error_description: "Client ID 不匹配" },
          400
        );
      }

      // RFC 6749 §4.1.3: token 端点必须校验 redirect_uri 与授权请求一致
      const redirect_uri = body.redirect_uri;
      if (!redirect_uri) {
        return resJson(
          { error: "invalid_grant", error_description: "缺少 redirect_uri" },
          400
        );
      }
      if (redirect_uri !== codeData.redirectUri) {
        recordSsoEvent({
          event: "token",
          userId: codeData.userId,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type, reason: "redirect_uri_mismatch", expected: codeData.redirectUri, got: redirect_uri },
        });
        return resJson(
          { error: "invalid_grant", error_description: "redirect_uri 与授权请求不一致" },
          400
        );
      }

      // PKCE 校验（强制）
      if (!codeData.codeChallenge) {
        return resJson(
          { error: "invalid_grant", error_description: "Authorization code was issued without PKCE" },
          400
        );
      }
      if (!code_verifier) {
        return resJson(
          { error: "invalid_grant", error_description: "Missing code_verifier" },
          400
        );
      }
      if (!verifyPKCE(code_verifier, codeData.codeChallenge, codeData.codeChallengeMethod || "S256")) {
        recordSsoEvent({
          event: "token",
          userId: codeData.userId,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type, reason: "pkce_failed" },
        });
        return resJson(
          { error: "invalid_grant", error_description: "Invalid code_verifier" },
          400
        );
      }

      // 查询用户信息
      const user = await prisma.user.findUnique({
        where: { id: codeData.userId },
        select: { id: true, phone: true, nickname: true, avatar: true, membershipLevel: true, totalPoints: true, status: true },
      });

      if (!user || user.status !== "ACTIVE") {
        recordSsoEvent({
          event: "token",
          userId: codeData.userId,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type, reason: "user_inactive" },
        });
        return resJson(
          { error: "invalid_grant", error_description: "用户账户不可用" },
          400
        );
      }

      const scopeStr = codeData.scopes.join(" ");

      // 二次校验 scope：用户 consent 未被撤销且仍覆盖所有请求 scope
      // （防止授权码签发后 consent 被撤销，token 仍被签发的窗口）
      const consent = await prisma.userConsent.findUnique({
        where: { userId_clientId: { userId: user.id, clientId: client_id } },
      });
      if (consent && consent.revokedAt) {
        recordSsoEvent({
          event: "token",
          userId: user.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type, reason: "consent_revoked" },
        });
        return resJson(
          { error: "invalid_grant", error_description: "用户已撤销对该应用的授权" },
          400
        );
      }
      const grantedScopes = consent && !consent.revokedAt ? consent.scopes : [];
      const allScopesCovered = codeData.scopes.every(
        (s) => OIDC_IMPLICIT_SCOPES.includes(s) || grantedScopes.includes(s)
      );
      if (!allScopesCovered) {
        recordSsoEvent({
          event: "token",
          userId: user.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type, reason: "scope_not_consented" },
        });
        return resJson(
          { error: "invalid_scope", error_description: "用户尚未授权所有请求的 scope" },
          400
        );
      }

      // DPoP 验证：客户端可选的令牌绑定证明
      let dpopJkt: string | undefined;
      const dpopProof = request.headers.get("DPoP");
      if (dpopProof) {
        const url = new URL(request.url);
        const htu = `${url.origin}${url.pathname}`.toLowerCase();
        const dpopResult = await validateDPoPProof(
          dpopProof,
          "POST",
          htu,
          undefined,
          undefined,
          `${client_id}:${user.id}`
        );
        if (!dpopResult.valid) {
          const errorHeaders: Record<string, string> = {};
          if (dpopResult.newNonce) {
            Object.assign(errorHeaders, dpopNonceHeader(dpopResult.newNonce));
          }
          return NextResponse.json(
            { error: dpopResult.error, error_description: dpopResult.errorDescription },
            { status: 400, headers: { ...corsHeaders, ...errorHeaders } }
          );
        }
        dpopJkt = dpopResult.jkt;
      }

      // 签发 Access Token（OAuth 类型），使用 client 自定义 TTL
      const accessToken = await signOAuthAccessToken({
        id: user.id,
        phone: user.phone,
        clientId: client_id,
        scope: scopeStr,
        expiresIn: `${client.accessTokenTtlSeconds}s`,
        dpopJkt,
      });

      // 签发 Refresh Token（携带 client_id / scope，用于所有权校验）
      const refreshToken = await signRefreshToken({
        id: user.id,
        phone: user.phone,
        clientId: client_id,
        scope: scopeStr,
      });
      const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // 保存 Refresh Token（复用现有设备管理）
      const deviceInfo = extractDeviceInfo(request);
      await saveRefreshToken(user.id, refreshToken, refreshExpiresAt, deviceInfo, client_id);

      // 签发 ID Token（含 at_hash）
      const idTokenClaims: IdTokenClaims = {
        sub: user.id,
        aud: client_id,
        scope: scopeStr,
        at_hash: computeAtHash(accessToken),
      };
      if (codeData.nonce) idTokenClaims.nonce = codeData.nonce;
      if (scopeStr.includes("phone")) idTokenClaims.phone = maskPhone(user.phone);
      if (scopeStr.includes("profile")) {
        if (user.nickname) idTokenClaims.nickname = user.nickname;
        if (user.avatar) idTokenClaims.avatar = user.avatar;
      }
      if (scopeStr.includes("membership") && user) {
        if (user.membershipLevel) idTokenClaims.membership_level = user.membershipLevel;
        if (user.totalPoints != null) idTokenClaims.total_points = user.totalPoints;
      }

      const idToken = await signIdToken(idTokenClaims);

      // 记录 OAuth Session（关联授权码用于追溯）
      // 确保同一 authorizationCode 不会创建重复 session
      const existingSession = await prisma.oAuthSession.findFirst({
        where: { authorizationCodeId: codeData.id },
      });
      if (!existingSession) {
        await prisma.oAuthSession.create({
          data: {
            userId: user.id,
            clientId: client_id,
            sessionId: crypto.randomUUID(),
            authorizationCodeId: codeData.id,
            scopes: codeData.scopes,
            expiresAt: refreshExpiresAt,
          },
        });
      }

      // 审计日志
      recordSsoEvent({
        event: "token",
        userId: user.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { grant_type: "authorization_code", scope: scopeStr },
      });

      // 记录登录尝试（OAuth 授权码登录）
      await recordLoginAttempt(user.phone, true, request, undefined, "oauth", user.id, client_id);

      const expiresIn = getExpiresInFromToken(accessToken) ?? (client.accessTokenTtlSeconds || DEFAULT_ACCESS_TOKEN_EXPIRES_IN);

      const tokenResponse: Record<string, unknown> = {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: expiresIn,
        refresh_token: refreshToken,
        refresh_expires_in: 30 * 24 * 60 * 60,
        scope: scopeStr,
      };
      // OIDC：仅当授权 scope 包含 openid 时才返回 id_token
      if (codeData.scopes.includes("openid")) {
        tokenResponse.id_token = idToken;
      }

      const extraHeaders: Record<string, string> = {};
      if (dpopJkt) {
        extraHeaders["DPoP-Nonce"] = randomBytes(24).toString("base64url");
      }

      return resJson(tokenResponse, 200, extraHeaders);
    }

    // === grant_type: refresh_token ===
    if (grant_type === "refresh_token") {
      const refresh_token = body.refresh_token;
      if (!refresh_token) {
        return resJson(
          { error: "invalid_grant", error_description: "缺少 refresh_token" },
          400
        );
      }

      // 先验证 JWT 签名
      const refreshPayload = await verifyRefreshToken(refresh_token);
      if (!refreshPayload) {
        return resJson(
          { error: "invalid_grant", error_description: "Refresh token 无效" },
          400
        );
      }

      // Refresh Token 所有权校验：OAuth 流程签发的 token 必须携带 client_id，
      // 且与请求方一致。无 client_id 的旧版内部 token 不允许在 OAuth 端点刷新。
      if (!refreshPayload.client_id) {
        recordSsoEvent({
          event: "token",
          userId: refreshPayload.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type: "refresh_token", reason: "missing_client_id" },
        });
        return resJson(
          { error: "invalid_grant", error_description: "Refresh token 无效" },
          400
        );
      }
      if (refreshPayload.client_id !== client_id) {
        recordSsoEvent({
          event: "token",
          userId: refreshPayload.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: {
            grant_type: "refresh_token",
            reason: "client_id_mismatch",
            expected: refreshPayload.client_id,
          },
        });
        return resJson(
          { error: "invalid_grant", error_description: "Refresh token 与当前 client 不匹配" },
          400
        );
      }

      // 签发新的 Access Token（OAuth 类型）
      // 优先使用原 Refresh Token payload 中的 scope，保证刷新不会扩大权限；
      // 仅当旧 token 未携带 scope 时才从 OAuthSession 回退获取。
      const now = new Date();
      let scopeStr = refreshPayload.scope || "";
      if (!scopeStr) {
        const session = await prisma.oAuthSession.findFirst({
          where: {
            userId: refreshPayload.id,
            clientId: client_id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          orderBy: { createdAt: "desc" },
        });
        scopeStr = session?.scopes?.join(" ") || "openid";
      }

      // 检查用户是否仍授权了该 client（consent 撤销后拒绝刷新）
      const consent = await prisma.userConsent.findUnique({
        where: { userId_clientId: { userId: refreshPayload.id, clientId: client_id } },
      });
      if (consent?.revokedAt) {
        recordSsoEvent({
          event: "token",
          userId: refreshPayload.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type: "refresh_token", reason: "consent_revoked" },
        });
        return resJson(
          { error: "invalid_grant", error_description: "用户已撤销对该应用的授权" },
          400
        );
      }

      const newAccessToken = await signOAuthAccessToken({
        id: refreshPayload.id,
        phone: refreshPayload.phone,
        clientId: client_id,
        scope: scopeStr,
        expiresIn: `${client.accessTokenTtlSeconds}s`,
      });

      // 签发新的 Refresh Token 并原子化轮换（继承所有权与 scope）
      const newRefreshToken = await signRefreshToken({
        id: refreshPayload.id,
        phone: refreshPayload.phone,
        clientId: client_id,
        scope: scopeStr,
      });
      const newRefreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const deviceInfo = extractDeviceInfo(request);
      const rotationResult = await atomicallyRotateRefreshToken(
        refreshPayload.id,
        refresh_token,
        newRefreshToken,
        newRefreshExpiresAt,
        deviceInfo,
        client_id
      );

      if (!rotationResult.valid) {
        recordSsoEvent({
          event: "token",
          userId: refreshPayload.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type: "refresh_token", reason: rotationResult },
        });
        return resJson(
          { error: "invalid_grant", error_description: "Refresh token 轮换失败" },
          400
        );
      }

      // 查询用户信息用于 ID Token
      const user = await prisma.user.findUnique({
        where: { id: refreshPayload.id },
        select: { id: true, phone: true, nickname: true, avatar: true, membershipLevel: true, totalPoints: true, status: true },
      });

      if (!user || user.status !== "ACTIVE") {
        recordSsoEvent({
          event: "token",
          userId: refreshPayload.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type: "refresh_token", reason: "user_inactive" },
        });
        return resJson(
          { error: "invalid_grant", error_description: "用户账户不可用" },
          400
        );
      }

      // 签发新的 ID Token（含 at_hash）
      const idTokenClaims: IdTokenClaims = {
        sub: refreshPayload.id,
        aud: client_id,
        scope: scopeStr,
        at_hash: computeAtHash(newAccessToken),
      };
      if (scopeStr.includes("phone") && user) {
        idTokenClaims.phone = maskPhone(user.phone);
      }
      if (scopeStr.includes("profile") && user) {
        if (user.nickname) idTokenClaims.nickname = user.nickname;
        if (user.avatar) idTokenClaims.avatar = user.avatar;
      }
      if (scopeStr.includes("membership") && user) {
        if (user.membershipLevel) idTokenClaims.membership_level = user.membershipLevel;
        if (user.totalPoints != null) idTokenClaims.total_points = user.totalPoints;
      }

      const idToken = await signIdToken(idTokenClaims);

      recordSsoEvent({
        event: "token",
        userId: refreshPayload.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { grant_type: "refresh_token" },
      });

      const refreshExpiresIn = 30 * 24 * 60 * 60;
      const newExpiresIn = getExpiresInFromToken(newAccessToken) ?? (client.accessTokenTtlSeconds || DEFAULT_ACCESS_TOKEN_EXPIRES_IN);

      const refreshResponse: Record<string, unknown> = {
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: newExpiresIn,
        refresh_token: newRefreshToken,
        refresh_expires_in: refreshExpiresIn,
        scope: scopeStr,
      };
      // OIDC：仅当原授权 scope 包含 openid 时才返回 id_token
      if (scopeStr.split(" ").filter(Boolean).includes("openid")) {
        refreshResponse.id_token = idToken;
      }

      return resJson(refreshResponse);
    }

    // === grant_type: client_credentials ===
    if (grant_type === "client_credentials") {
      // Public Client 不能使用 client_credentials（M2M 场景需要信任客户端）
      if (client.isPublic) {
        return resJson(
          { error: "unauthorized_client", error_description: "Public Client 不能使用 client_credentials 模式" },
          401
        );
      }

      // M2M 场景：Confidential Client 必须提供 client_secret
      if (!client_secret) {
        return resJson(
          { error: "invalid_client", error_description: "client_credentials 需要 client_secret" },
          401
        );
      }

      const scopeRaw = body.scope || "";
      const requestedScopes = scopeRaw.split(" ").filter(Boolean);
      // 校验 scope
      for (const s of requestedScopes) {
        if (!client.scopes.includes(s)) {
          return resJson(
            { error: "invalid_scope", error_description: `Scope '${s}' not allowed` },
            400
          );
        }
      }

      // 签发 Access Token（M2M 场景，sub = client:xxx，无用户身份）
      // userinfo 端点通过 payload.id.startsWith("client:") 识别此类型，仅返回 sub
      const effectiveScope = scopeRaw || "";
      const accessToken = await signOAuthAccessToken({
        id: `client:${client_id}`,
        phone: "",
        clientId: client_id,
        scope: effectiveScope,
        expiresIn: `${client.accessTokenTtlSeconds}s`,
      });

      const expiresIn = getExpiresInFromToken(accessToken) ?? (client.accessTokenTtlSeconds || DEFAULT_ACCESS_TOKEN_EXPIRES_IN);

      recordSsoEvent({
        event: "token",
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { grant_type: "client_credentials", scope: scopeRaw },
      });

      return resJson({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: expiresIn,
        scope: effectiveScope,
      });
    }

    // 不支持的 grant_type
    return resJson(
      { error: "unsupported_grant_type", error_description: "不支持的 grant_type" },
      400
    );
  } catch (error) {
    apiConsole.error("[OAuth Token] 异常:", error);
    return resJson(
      { error: "server_error", error_description: "服务器内部错误" },
      500
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

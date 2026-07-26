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
 * - Refresh Token 原子化轮换（复用 atomicallyRotateRefreshToken）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { consumeAuthorizationCode, verifyPKCE } from "@/lib/oauth-code";
import {
  signOAuthAccessToken,
  signIdToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiresAt,
  computeAtHash,
  type IdTokenClaims,
} from "@/lib/jwt";
import { atomicallyRotateRefreshToken, extractDeviceInfo, saveRefreshToken } from "@/lib/auth-security";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { recordLoginAttempt } from "@/lib/auth-security";
import { maskPhone } from "@/lib/mask-phone";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Access Token 有效期（秒）：15 分钟 */
const ACCESS_TOKEN_EXPIRES_IN = 900;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // 限流（IP 级 + client_id 级）
    // 多租户：限流 key 应为 {tenantId}:oauth-token:{ip}，当前使用 "" 作为默认 tenantId
    const limitResult = await rateLimit(ip, "oauth-token");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
        { status: 429 }
      );
    }

    // 读取 body（支持 JSON 和 form-urlencoded）
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

    const grant_type = body.grant_type;
    const client_id = body.client_id;
    const client_secret = body.client_secret;

    if (!client_id || !client_secret) {
      return NextResponse.json(
        { error: "invalid_client", error_description: "缺少 client_id 或 client_secret" },
        { status: 401 }
      );
    }

    // client_id 级限流
    const clientLimitResult = await rateLimit(`client:${client_id}`, "oauth-token");
    if (!clientLimitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "子项目请求过于频繁" },
        { status: 429 }
      );
    }

    // 验证 client_secret
    const client = await verifyOAuthClientSecret(client_id, client_secret);
    if (!client) {
      recordSsoEvent({
        event: "token",
        clientId: client_id,
        ip,
        success: false,
        detail: { grant_type, reason: "invalid_client_secret" },
      });
      return NextResponse.json(
        { error: "invalid_client", error_description: "Client 认证失败" },
        { status: 401 }
      );
    }

    // === grant_type: authorization_code ===
    if (grant_type === "authorization_code") {
      const code = body.code;
      const code_verifier = body.code_verifier;

      if (!code) {
        return NextResponse.json(
          { error: "invalid_grant", error_description: "缺少 authorization code" },
          { status: 400 }
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
        return NextResponse.json(
          { error: "invalid_grant", error_description: "Authorization code 无效或已被使用" },
          { status: 400 }
        );
      }

      // 检查授权码过期
      if (new Date() > codeData.expiresAt) {
        recordSsoEvent({
          event: "token",
          userId: codeData.userId,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { grant_type, reason: "code_expired" },
        });
        return NextResponse.json(
          { error: "invalid_grant", error_description: "Authorization code expired" },
          { status: 400 }
        );
      }

      // 校验 client_id 与授权码一致
      if (codeData.clientId !== client_id) {
        return NextResponse.json(
          { error: "invalid_grant", error_description: "Client ID 不匹配" },
          { status: 400 }
        );
      }

      // PKCE 校验
      if (codeData.codeChallenge) {
        if (!code_verifier) {
          return NextResponse.json(
            { error: "invalid_grant", error_description: "Missing code_verifier" },
            { status: 400 }
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
          return NextResponse.json(
            { error: "invalid_grant", error_description: "Invalid code_verifier" },
            { status: 400 }
          );
        }
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
        return NextResponse.json(
          { error: "invalid_grant", error_description: "用户账户不可用" },
          { status: 400 }
        );
      }

      const scopeStr = codeData.scopes.join(" ");

      // 签发 Access Token（OAuth 类型）
      const accessToken = await signOAuthAccessToken({
        id: user.id,
        phone: user.phone,
        clientId: client_id,
        scope: scopeStr,
      });

      // 签发 Refresh Token
      const refreshToken = await signRefreshToken({ id: user.id, phone: user.phone });
      const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // 保存 Refresh Token（复用现有设备管理）
      const deviceInfo = extractDeviceInfo(request);
      await saveRefreshToken(user.id, refreshToken, refreshExpiresAt, deviceInfo);

      // 签发 ID Token（含 at_hash）
      const idTokenClaims: IdTokenClaims = {
        sub: user.id,
        aud: client_id,
        scope: scopeStr,
        at_hash: computeAtHash(accessToken),
      };
      if (scopeStr.includes("phone")) idTokenClaims.phone = maskPhone(user.phone);
      if (scopeStr.includes("profile")) {
        if (user.nickname) idTokenClaims.nickname = user.nickname;
        if (user.avatar) idTokenClaims.avatar = user.avatar;
      }
      if (scopeStr.includes("membership")) {
        if (user.membershipLevel) idTokenClaims.membershipLevel = user.membershipLevel;
        if (user.totalPoints != null) idTokenClaims.totalPoints = user.totalPoints;
      }

      const idToken = await signIdToken(idTokenClaims);

      // 记录 OAuth Session（关联授权码用于追溯）
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

      return NextResponse.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_EXPIRES_IN, // 15 分钟
        refresh_token: refreshToken,
        id_token: idToken,
      });
    }

    // === grant_type: refresh_token ===
    if (grant_type === "refresh_token") {
      const refresh_token = body.refresh_token;
      if (!refresh_token) {
        return NextResponse.json(
          { error: "invalid_grant", error_description: "缺少 refresh_token" },
          { status: 400 }
        );
      }

      // 先验证 JWT 签名
      const refreshPayload = await verifyRefreshToken(refresh_token);
      if (!refreshPayload) {
        return NextResponse.json(
          { error: "invalid_grant", error_description: "Refresh token 无效" },
          { status: 400 }
        );
      }

      // 签发新的 Access Token（OAuth 类型）
      // 注意：refresh token 不携带 scope/client_id，需要从 OAuthSession 获取
      const session = await prisma.oAuthSession.findFirst({
        where: { userId: refreshPayload.id, clientId: client_id, revokedAt: null },
        orderBy: { createdAt: "desc" },
      });

      const scopeStr = session?.scopes?.join(" ") || "openid";

      const newAccessToken = await signOAuthAccessToken({
        id: refreshPayload.id,
        phone: refreshPayload.phone,
        clientId: client_id,
        scope: scopeStr,
      });

      // 签发新的 Refresh Token 并原子化轮换
      const newRefreshToken = await signRefreshToken({
        id: refreshPayload.id,
        phone: refreshPayload.phone,
      });
      const newRefreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const deviceInfo = extractDeviceInfo(request);
      const rotationResult = await atomicallyRotateRefreshToken(
        refreshPayload.id,
        refresh_token,
        newRefreshToken,
        newRefreshExpiresAt,
        deviceInfo
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
        return NextResponse.json(
          { error: "invalid_grant", error_description: "Refresh token 轮换失败" },
          { status: 400 }
        );
      }

      // 查询用户信息用于 ID Token
      const user = await prisma.user.findUnique({
        where: { id: refreshPayload.id },
        select: { id: true, phone: true, nickname: true, avatar: true, membershipLevel: true, totalPoints: true },
      });

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
        if (user.membershipLevel) idTokenClaims.membershipLevel = user.membershipLevel;
        if (user.totalPoints != null) idTokenClaims.totalPoints = user.totalPoints;
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

      return NextResponse.json({
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_EXPIRES_IN,
        refresh_token: newRefreshToken,
        id_token: idToken,
      });
    }

    // 不支持的 grant_type
    return NextResponse.json(
      { error: "unsupported_grant_type", error_description: "不支持的 grant_type" },
      { status: 400 }
    );
  } catch (error) {
    apiConsole.error("[OAuth Token] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

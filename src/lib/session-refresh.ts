/**
 * 用户会话刷新公共逻辑
 *
 * 从 /api/auth/refresh 路由抽取的核心"验 refresh → 签新双 token"事务，
 * 供需要透明刷新主站会话的场景复用（如 OAuth authorize 的 SSO 登录态兜底）。
 *
 * 职责边界：
 * - 本函数只做纯粹的刷新事务：验证 refresh token JWT、拒绝 OAuth client_id token、
 *   用户状态检查、原子化轮换（沿用 auth-security 的撤销/过期/重用吊销语义）、
 *   重签双 token，并写与 refresh 路由同风格的审计日志。
 * - 路由层职责（限流、CSRF、Cookie 读写、HTTP 响应映射）由调用方自行处理，
 *   本函数返回新 token 串，由调用方决定如何种 Cookie。
 */
import { verifyRefreshToken, signUserToken, signRefreshToken } from "./jwt";
import {
  atomicallyRotateRefreshToken,
  revokeRefreshToken,
  type DeviceInfo,
  type RefreshTokenValidationResult,
} from "./auth-security";
import { checkUserStatus } from "./auth";
import { prisma } from "./prisma";
import { logAuthEvent } from "./auth-logger";

export interface RefreshUserSessionOptions {
  /** 审计日志的调用方 IP */
  ip?: string;
  /** 设备信息（轮换时入库），通常由调用方 extractDeviceInfo(request) 提取 */
  deviceInfo?: DeviceInfo;
  /**
   * 审计日志的调用渠道标识（如 "authorize_transparent_refresh"），
   * 便于区分主站定时刷新与 authorize 透明刷新
   */
  channel?: string;
}

/** 原子轮换失败原因（missing / revoked / expired / account_disabled / concurrent_rotation / error） */
type RotationFailureReason = Extract<RefreshTokenValidationResult, { valid: false }>["reason"];

export type RefreshUserSessionResult =
  | {
      success: true;
      userId: string;
      /** 审计用的手机号（按 id 查库，refresh token 不再携带明文 phone） */
      userPhone?: string;
      accessToken: string;
      refreshToken: string;
      /** 原始认证时间（Unix 秒），取自旧 token 的 auth_time ?? iat，刷新不重置 */
      authTime?: number;
    }
  | {
      success: false;
      reason: "invalid_token" | "oauth_token" | RotationFailureReason;
      userId?: string;
      userPhone?: string;
      /** account_disabled 时的账号状态描述 */
      statusReason?: string;
    };

/**
 * 验证并轮换用户 Refresh Token，签发新双 Token。
 *
 * 成功返回新 token 串（调用方负责种 Cookie）；失败返回原因，不抛异常以外的错误
 * （DB 异常等仍会沿调用链上抛，由调用方决定降级策略）。
 */
export async function refreshUserSession(
  refreshToken: string,
  options: RefreshUserSessionOptions = {}
): Promise<RefreshUserSessionResult> {
  const { ip, deviceInfo, channel } = options;

  // 1. 验证 Refresh Token JWT
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) {
    logAuthEvent("user_refresh_token", {
      success: false,
      reason: "invalid_token",
      ip,
      channel,
    });
    return { success: false, reason: "invalid_token" };
  }

  // refresh token 已不再携带明文手机号 claim，审计日志的 identifier 按 id 查库获取
  // （与 logout 路由的既有做法一致）
  const tokenUser = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { phone: true },
  });
  const userPhone = tokenUser?.phone;

  // 2. 拒绝携带 client_id 的 OAuth Refresh Token 在内部刷新路径使用
  if (payload.client_id) {
    logAuthEvent("user_refresh_token", {
      userId: payload.id,
      identifier: userPhone,
      success: false,
      reason: "oauth_token_on_internal_endpoint",
      ip,
      channel,
    });
    return { success: false, reason: "oauth_token", userId: payload.id, userPhone };
  }

  // 3. 检查账号状态
  const statusCheck = await checkUserStatus(payload.id);
  if (!statusCheck.valid) {
    logAuthEvent("user_refresh_token", {
      success: false,
      reason: `account_${statusCheck.status.toLowerCase()}`,
      userId: payload.id,
      identifier: userPhone,
      ip,
      channel,
    });
    return {
      success: false,
      reason: "account_disabled",
      userId: payload.id,
      userPhone,
      statusReason: statusCheck.reason,
    };
  }

  // 4. 签发新双 Token（先签发，后续在原子事务中与旧 Token 一起处理）
  // 原始认证时间固化：优先透传旧 token 的 auth_time；首次换发时以旧 refresh token 的
  // iat（登录时刻）为准写入 auth_time，后续换发不再重置，防止 max_age 被新 iat 架空
  const authTime = payload.auth_time ?? payload.iat;
  const newAccessToken = await signUserToken({
    id: payload.id,
    authTime,
  });
  const newRefreshToken = await signRefreshToken({
    id: payload.id,
    authTime,
  });
  const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // 5. 原子化验证旧 Token 并轮换新 Token
  //    在单一 DB 事务中完成：查找旧 Token → 校验状态 → 撤销旧 → 保存新
  //    消除 validate + revoke + save 之间的 Race Condition 窗口
  const rotation = await atomicallyRotateRefreshToken(
    payload.id,
    refreshToken,
    newRefreshToken,
    refreshTokenExpiresAt,
    deviceInfo
  );

  if (!rotation.valid) {
    // Refresh Token 重用检测：仅对 revoked/missing 执行全量撤销（安全的 token 泄漏信号）
    // concurrent_rotation 是正常并发场景，不撤销所有设备（避免多 Tab 误伤）
    if (rotation.reason === "revoked" || rotation.reason === "missing") {
      logAuthEvent("refresh_token_reuse_detected", {
        userId: payload.id,
        identifier: userPhone,
        reason: rotation.reason,
        ip,
        channel,
      });
      await revokeRefreshToken(payload.id);
    }

    logAuthEvent("user_refresh_token", {
      success: false,
      reason: rotation.reason,
      userId: payload.id,
      identifier: userPhone,
      ip,
      channel,
    });
    return { success: false, reason: rotation.reason, userId: payload.id, userPhone };
  }

  logAuthEvent("user_refresh_token", {
    userId: payload.id,
    identifier: userPhone,
    success: true,
    ip,
    channel,
  });

  return {
    success: true,
    userId: payload.id,
    userPhone,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    authTime,
  };
}

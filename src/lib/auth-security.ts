/**
 * 认证安全工具
 * 处理登录尝试记录、账户锁定、失败限制等
 */
import { prisma } from "./prisma";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { apiConsole } from "@/lib/logger";
import { getClientIP } from "./client-ip";
import { logAuthEvent } from "./auth-logger";

// ============================================
// 防爆破配置
// ============================================

/**
 * 防爆破配置
 */
export interface BruteForceConfig {
  /** 最大失败次数 */
  maxAttempts: number;
  /** 时间窗口（分钟） */
  windowMinutes: number;
  /** 锁定时长（分钟） */
  lockoutMinutes: number;
}

/**
 * 默认防爆破配置
 */
export const DEFAULT_BRUTE_FORCE_CONFIG: BruteForceConfig = {
  maxAttempts: 5, // 5次失败
  windowMinutes: 15, // 15分钟内
  lockoutMinutes: 30, // 锁定30分钟
};

// ============================================
// 登录尝试管理
// ============================================

/** 每个用户允许的最大设备数（Refresh Token 设备上限） */
export const MAX_REFRESH_TOKEN_DEVICES = 10;

/**
 * 获取 User Agent
 */
export function getUserAgent(request: NextRequest): string | null {
  return request.headers.get("user-agent");
}

/**
 * 记录登录尝试
 * @param identifier 登录标识（手机号或邮箱）
 * @param success 是否成功
 * @param request 请求对象
 * @param reason 失败原因
 * @param type 认证类型
 * @param userId 用户 ID（成功登录时传入）
 */
export async function recordLoginAttempt(
  identifier: string,
  success: boolean,
  request: NextRequest,
  reason?: string,
  type: "password" | "sms" = "password",
  userId?: string
): Promise<void> {
  const ip = getClientIP(request);
  const ua = getUserAgent(request);

  try {
    await prisma.loginAttempt.create({
      data: {
        identifier,
        type,
        success,
        reason: success ? null : reason,
        ipAddress: ip,
        userAgent: ua,
      },
    });

    logAuthEvent("user_login", {
      userId,
      identifier,
      success,
      reason,
      type,
      ip,
      ua,
    });
  } catch (error) {
    const { logError } = await import("./logger");
    logError("RecordLoginAttempt", error, { identifier, success });
  }
}

/**
 * 检查账户是否被锁定（防爆破）
 * @param identifier 登录标识（手机号或邮箱）
 * @param config 防爆破配置
 * @returns { locked: boolean, remainingMinutes: number }
 */
export async function checkAccountLockout(
  identifier: string,
  config: BruteForceConfig = DEFAULT_BRUTE_FORCE_CONFIG
): Promise<{ locked: boolean; remainingMinutes: number }> {
  try {
    // 查询时间窗口内的失败尝试
    const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000);

    const failedAttempts = await prisma.loginAttempt.count({
      where: {
        identifier,
        success: false,
        createdAt: { gte: windowStart },
      },
    });

    if (failedAttempts >= config.maxAttempts) {
      // 账户已锁定，计算剩余锁定时间
      const lastFailedAttempt = await prisma.loginAttempt.findFirst({
        where: {
          identifier,
          success: false,
          createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: "desc" },
      });

      if (lastFailedAttempt) {
        const lockoutUntil = new Date(
          lastFailedAttempt.createdAt.getTime() + config.lockoutMinutes * 60 * 1000
        );
        const now = new Date();

        if (lockoutUntil > now) {
          const remainingMs = lockoutUntil.getTime() - now.getTime();
          const remainingMinutes = Math.ceil(remainingMs / 60 / 1000);
          return { locked: true, remainingMinutes };
        }
      }
    }

    return { locked: false, remainingMinutes: 0 };
  } catch (error) {
    apiConsole.error("[CheckAccountLockout] 检查错误:", error);
    // fail-closed：数据库异常时默认锁定 15 分钟，防止攻击者利用故障绕过防爆破
    return { locked: true, remainingMinutes: 15 };
  }
}

/**
 * 清除特定用户的登录尝试记录（成功登录后清除）
 */
export async function clearLoginAttempts(identifier: string): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({
      where: { identifier },
    });
  } catch (error) {
    apiConsole.error("[ClearLoginAttempts] 清除失败:", error);
    // 不抛出异常
  }
}

// ============================================
// Refresh Token 管理
// ============================================

/**
 * 保存 Refresh Token 到数据库
 */
/**
 * 计算 Token 的 SHA-256 哈希值
 * 数据库中只存储哈希，不存储原始 JWT
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface DeviceInfo {
  deviceName?: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 生成设备指纹，用于识别同一设备
 */
/**
 * 从请求中提取设备信息
 */
export function extractDeviceInfo(request: NextRequest): DeviceInfo {
  const userAgent = request.headers.get("user-agent") || undefined;
  const ipAddress = getClientIP(request);

  // 简单的设备名称解析
  let deviceName = "未知设备";
  if (userAgent) {
    if (userAgent.includes("Mobile")) {
      deviceName = "手机浏览器";
    } else if (userAgent.includes("Tablet")) {
      deviceName = "平板浏览器";
    } else if (userAgent.includes("Windows")) {
      deviceName = "Windows 浏览器";
    } else if (userAgent.includes("Mac")) {
      deviceName = "Mac 浏览器";
    } else if (userAgent.includes("Linux")) {
      deviceName = "Linux 浏览器";
    } else {
      deviceName = "桌面浏览器";
    }
  }

  return {
    deviceName,
    deviceInfo: userAgent?.slice(0, 200),
    ipAddress,
    userAgent,
  };
}

function getDeviceFingerprint(info?: DeviceInfo): string {
  if (!info) return "unknown";
  const ua = info.deviceInfo || info.userAgent || "";
  const ip = info.ipAddress || "";
  const name = info.deviceName || "";
  return createHash("sha256").update(`${name}|${ua}|${ip}`).digest("hex");
}

export async function saveRefreshToken(
  userId: string,
  token: string,
  expiresAt: Date,
  deviceInfo?: DeviceInfo
): Promise<void> {
  try {
    const tokenHash = hashToken(token);
    const fingerprint = getDeviceFingerprint(deviceInfo);

    await prisma.$transaction(async (tx) => {
      // 1. 查找同一设备的旧 Token（如果存在则更新，实现设备级复用）
      const existingTokens = await tx.refreshToken.findMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "asc" },
      });

      const sameDeviceToken = existingTokens.find((t) => {
        const existingFingerprint = getDeviceFingerprint({
          deviceName: t.deviceName || undefined,
          deviceInfo: t.deviceInfo || undefined,
          ipAddress: t.ipAddress || undefined,
          userAgent: t.userAgent || undefined,
        });
        return existingFingerprint === fingerprint;
      });

      if (sameDeviceToken) {
        // 更新同一设备的 Token
        await tx.refreshToken.update({
          where: { id: sameDeviceToken.id },
          data: {
            token: tokenHash,
            expiresAt,
            deviceName: deviceInfo?.deviceName ?? sameDeviceToken.deviceName,
            deviceInfo: deviceInfo?.deviceInfo ?? sameDeviceToken.deviceInfo,
            ipAddress: deviceInfo?.ipAddress ?? sameDeviceToken.ipAddress,
            userAgent: deviceInfo?.userAgent ?? sameDeviceToken.userAgent,
            revokedAt: null,
            updatedAt: new Date(),
          },
        });
      } else {
        // 2. 限制每个用户的最大设备数，防止无限增长
        if (existingTokens.length >= MAX_REFRESH_TOKEN_DEVICES) {
          // 撤销最早的 Token
          const tokensToRevoke = existingTokens.slice(
            0,
            existingTokens.length - MAX_REFRESH_TOKEN_DEVICES + 1
          );
          await tx.refreshToken.updateMany({
            where: { id: { in: tokensToRevoke.map((t) => t.id) } },
            data: { revokedAt: new Date() },
          });
        }

        // 创建新 Token
        await tx.refreshToken.create({
          data: {
            userId,
            token: tokenHash,
            expiresAt,
            deviceName: deviceInfo?.deviceName,
            deviceInfo: deviceInfo?.deviceInfo,
            ipAddress: deviceInfo?.ipAddress,
            userAgent: deviceInfo?.userAgent,
          },
        });
      }
    });
  } catch (error) {
    apiConsole.error("[SaveRefreshToken] 保存失败:", error);
    throw error;
  }
}

export type RefreshTokenValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason: "missing" | "revoked" | "expired" | "account_disabled" | "concurrent_rotation";
    };

/**
 * 原子化验证并轮换 Refresh Token
 * 在单个数据库事务中完成：验证旧 Token → 撤销旧 Token → 创建新 Token
 * 消除 validate + revoke + create 之间的 Race Condition 窗口
 *
 * @returns 成功时返回 { valid: true }，失败时返回失败原因
 */
export async function atomicallyRotateRefreshToken(
  userId: string,
  oldToken: string,
  newToken: string,
  expiresAt: Date,
  deviceInfo?: DeviceInfo
): Promise<RefreshTokenValidationResult> {
  try {
    const oldTokenHash = hashToken(oldToken);
    const newTokenHash = hashToken(newToken);
    const fingerprint = getDeviceFingerprint(deviceInfo);

    const result = await prisma.$transaction(async (tx) => {
      // 1. 查找旧 Token（必须是未撤销、未过期的）
      const existing = await tx.refreshToken.findFirst({
        where: {
          userId,
          token: oldTokenHash,
          expiresAt: { gt: new Date() },
        },
      });

      if (!existing) {
        return { valid: false as const, reason: "missing" as const };
      }

      if (existing.revokedAt) {
        return { valid: false as const, reason: "revoked" as const };
      }

      // 2. 校验账号状态
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true },
      });

      if (user?.status !== "ACTIVE") {
        return { valid: false as const, reason: "account_disabled" as const };
      }

      // 3. 撤销旧 Token（通过 revokedAt = null 条件进行乐观锁，防止并发重复使用）
      const revokeResult = await tx.refreshToken.updateMany({
        where: {
          id: existing.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      if (revokeResult.count === 0) {
        // 并发场景：另一个请求已先撤销此 Token → 视为重用攻击
        return { valid: false as const, reason: "concurrent_rotation" as const };
      }

      // 4. 查找同设备旧 Token 并更新或创建（设备级复用，与 saveRefreshToken 逻辑一致）
      const existingTokens = await tx.refreshToken.findMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "asc" },
      });

      const sameDeviceToken = existingTokens.find((t) => {
        const existingFingerprint = getDeviceFingerprint({
          deviceName: t.deviceName || undefined,
          deviceInfo: t.deviceInfo || undefined,
          ipAddress: t.ipAddress || undefined,
          userAgent: t.userAgent || undefined,
        });
        return existingFingerprint === fingerprint;
      });

      if (sameDeviceToken) {
        await tx.refreshToken.update({
          where: { id: sameDeviceToken.id },
          data: {
            token: newTokenHash,
            expiresAt,
            deviceName: deviceInfo?.deviceName ?? sameDeviceToken.deviceName,
            deviceInfo: deviceInfo?.deviceInfo ?? sameDeviceToken.deviceInfo,
            ipAddress: deviceInfo?.ipAddress ?? sameDeviceToken.ipAddress,
            userAgent: deviceInfo?.userAgent ?? sameDeviceToken.userAgent,
            revokedAt: null,
            updatedAt: new Date(),
          },
        });
      } else {
        if (existingTokens.length >= MAX_REFRESH_TOKEN_DEVICES) {
          const tokensToRevoke = existingTokens.slice(
            0,
            existingTokens.length - MAX_REFRESH_TOKEN_DEVICES + 1
          );
          await tx.refreshToken.updateMany({
            where: { id: { in: tokensToRevoke.map((t) => t.id) } },
            data: { revokedAt: new Date() },
          });
        }

        await tx.refreshToken.create({
          data: {
            userId,
            token: newTokenHash,
            expiresAt,
            deviceName: deviceInfo?.deviceName,
            deviceInfo: deviceInfo?.deviceInfo,
            ipAddress: deviceInfo?.ipAddress,
            userAgent: deviceInfo?.userAgent,
          },
        });
      }

      return { valid: true as const };
    });

    return result;
  } catch (error) {
    apiConsole.error("[AtomicallyRotateRefreshToken] 失败:", error);
    return { valid: false, reason: "missing" };
  }
}

/**
 * 撤销 Refresh Token（登出时调用）
 * 返回实际被撤销的记录数，便于调用方检测并发重用。
 */
export async function revokeRefreshToken(userId: string, token?: string): Promise<number> {
  try {
    if (token) {
      // 撤销特定 token（比对哈希值），仅撤销尚未撤销的，便于检测并发重用
      const tokenHash = hashToken(token);
      const result = await prisma.refreshToken.updateMany({
        where: {
          userId,
          token: tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      return result.count;
    } else {
      // 撤销用户所有有效 token
      const result = await prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      return result.count;
    }
  } catch (error) {
    apiConsole.error("[RevokeRefreshToken] 撤销失败:", error);
    return 0;
  }
}

/**
 * 清理过期的 Refresh Token（可定期运行）
 */
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    console.log(`[CleanupExpiredRefreshTokens] 清理了 ${result.count} 个过期 token`);
    return result.count;
  } catch (error) {
    apiConsole.error("[CleanupExpiredRefreshTokens] 清理失败:", error);
    return 0;
  }
}

/**
 * 清理陈旧的登录尝试记录（可定期运行）
 * 保留最近 7 天的记录用于安全审计，超出 7 天的自动删除
 * 防止 LoginAttempt 表无限增长
 */
export async function cleanupOldLoginAttempts(): Promise<number> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await prisma.loginAttempt.deleteMany({
      where: {
        createdAt: { lt: sevenDaysAgo },
      },
    });
    console.log(`[CleanupLoginAttempts] 清理了 ${result.count} 条陈旧登录记录`);
    return result.count;
  } catch (error) {
    apiConsole.error("[CleanupLoginAttempts] 清理失败:", error);
    return 0;
  }
}

/**
 * 清理过期/已使用的 SmsCode 记录（可定期运行）
 * 保留最近 7 天的记录用于安全审计，超出 7 天的自动删除
 * 防止 SmsCode 表无限增长
 */
export async function cleanupExpiredSmsCodes(): Promise<number> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await prisma.smsCode.deleteMany({
      where: {
        createdAt: { lt: sevenDaysAgo },
      },
    });
    console.log(`[CleanupSmsCodes] 清理了 ${result.count} 条过期验证码记录`);
    return result.count;
  } catch (error) {
    apiConsole.error("[CleanupSmsCodes] 清理失败:", error);
    return 0;
  }
}

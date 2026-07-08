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
  maxAttempts: 5,        // 5次失败
  windowMinutes: 15,     // 15分钟内
  lockoutMinutes: 30,    // 锁定30分钟
};

// ============================================
// 登录尝试管理
// ============================================


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
 */
export async function recordLoginAttempt(
  identifier: string,
  success: boolean,
  request: NextRequest,
  reason?: string,
  type: "password" | "sms" = "password"
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
      identifier,
      success,
      reason,
      type,
      ip,
      ua,
    });
  } catch (error) {
    // 使用结构化日志记录失败，不阻塞主流程
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
    const windowStart = new Date(
      Date.now() - config.windowMinutes * 60 * 1000
    );

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
        },
        orderBy: { createdAt: "desc" },
      });

      if (lastFailedAttempt) {
        const lockoutUntil = new Date(
          lastFailedAttempt.createdAt.getTime() +
            config.lockoutMinutes * 60 * 1000
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
 * 获取最近的登录尝试统计
 */
export async function getLoginAttemptStats(
  identifier: string,
  windowMinutes: number = 15
): Promise<{
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  lastAttempt: Date | null;
}> {
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const attempts = await prisma.loginAttempt.findMany({
      where: {
        identifier,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
    });

    const successCount = attempts.filter((a) => a.success).length;
    const failureCount = attempts.filter((a) => !a.success).length;

    return {
      totalAttempts: attempts.length,
      successCount,
      failureCount,
      lastAttempt: attempts.length > 0 ? attempts[0].createdAt : null,
    };
  } catch (error) {
    apiConsole.error("[GetLoginAttemptStats] 获取统计错误:", error);
    return {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      lastAttempt: null,
    };
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
  const ua = info.userAgent || "";
  const ip = info.ipAddress || "";
  // 使用 UA 前 80 字符 + IP 生成指纹
  return createHash("sha256")
    .update(`${ua.slice(0, 80)}:${ip}`)
    .digest("hex");
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
        // 2. 限制每个用户的最大设备数（例如 10 个），防止无限增长
        const MAX_DEVICES = 10;
        if (existingTokens.length >= MAX_DEVICES) {
          // 撤销最早的 Token
          const tokensToRevoke = existingTokens.slice(0, existingTokens.length - MAX_DEVICES + 1);
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

/**
 * 验证并刷新 Token
 * 使用 refresh token 获取新的 access token
 */
export async function validateAndRefreshToken(
  userId: string,
  token: string
): Promise<boolean> {
  try {
    const tokenHash = hashToken(token);
    const refreshToken = await prisma.refreshToken.findFirst({
      where: {
        userId,
        token: tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!refreshToken) return false;

    // 校验账号状态，被冻结/封禁用户无法刷新 Token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });

    return user?.status === "ACTIVE";
  } catch (error) {
    apiConsole.error("[ValidateAndRefreshToken] 验证失败:", error);
    return false;
  }
}

/**
 * 撤销 Refresh Token（登出时调用）
 */
export async function revokeRefreshToken(
  userId: string,
  token?: string
): Promise<void> {
  try {
    if (token) {
      // 撤销特定 token（比对哈希值）
      const tokenHash = hashToken(token);
      await prisma.refreshToken.updateMany({
        where: {
          userId,
          token: tokenHash,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } else {
      // 撤销用户所有有效 token
      await prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }
  } catch (error) {
    apiConsole.error("[RevokeRefreshToken] 撤销失败:", error);
    // 不抛出异常
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

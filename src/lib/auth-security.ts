/**
 * 认证安全工具
 * 处理登录尝试记录、账户锁定、失败限制等
 */
import { prisma } from "./prisma";
import { NextRequest } from "next/server";

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
 * 获取客户端 IP 地址
 */
export function getClientIP(request: NextRequest): string {
  // 优先使用可信代理直接提供的真实 IP
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim()).filter(Boolean);
    // 取最后一个 IP：由最靠近服务器的可信代理追加，不易被客户端伪造
    return ips[ips.length - 1] || "unknown";
  }

  // 回退到 socket 地址（开发环境）
  return "127.0.0.1";
}

/**
 * 获取 User Agent
 */
export function getUserAgent(request: NextRequest): string | null {
  return request.headers.get("user-agent");
}

/**
 * 记录登录尝试
 * @param phone 手机号
 * @param success 是否成功
 * @param request 请求对象
 * @param reason 失败原因
 * @param type 认证类型
 */
export async function recordLoginAttempt(
  phone: string,
  success: boolean,
  request: NextRequest,
  reason?: string,
  type: "password" | "sms" = "password"
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        phone,
        type,
        success,
        reason: success ? null : reason,
        ipAddress: getClientIP(request),
        userAgent: getUserAgent(request),
      },
    });
  } catch (error) {
    console.error("[RecordLoginAttempt] 记录失败:", error);
    // 不抛出异常，避免影响主流程
  }
}

/**
 * 检查账户是否被锁定（防爆破）
 * @param phone 手机号
 * @param config 防爆破配置
 * @returns { locked: boolean, remainingMinutes: number }
 */
export async function checkAccountLockout(
  phone: string,
  config: BruteForceConfig = DEFAULT_BRUTE_FORCE_CONFIG
): Promise<{ locked: boolean; remainingMinutes: number }> {
  try {
    // 查询时间窗口内的失败尝试
    const windowStart = new Date(
      Date.now() - config.windowMinutes * 60 * 1000
    );

    const failedAttempts = await prisma.loginAttempt.count({
      where: {
        phone,
        success: false,
        createdAt: { gte: windowStart },
      },
    });

    if (failedAttempts >= config.maxAttempts) {
      // 账户已锁定，计算剩余锁定时间
      const lastFailedAttempt = await prisma.loginAttempt.findFirst({
        where: {
          phone,
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
    console.error("[CheckAccountLockout] 检查错误:", error);
    // 出错时不锁定账户，记录错误但继续
    return { locked: false, remainingMinutes: 0 };
  }
}

/**
 * 获取最近的登录尝试统计
 */
export async function getLoginAttemptStats(
  phone: string,
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
        phone,
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
    console.error("[GetLoginAttemptStats] 获取统计错误:", error);
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
export async function clearLoginAttempts(phone: string): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({
      where: { phone },
    });
  } catch (error) {
    console.error("[ClearLoginAttempts] 清除失败:", error);
    // 不抛出异常
  }
}

// ============================================
// Refresh Token 管理
// ============================================

/**
 * 保存 Refresh Token 到数据库
 */
export async function saveRefreshToken(
  userId: string,
  token: string,
  expiresAt: Date
): Promise<void> {
  try {
    // 原子操作：删除旧 Token + 创建新 Token，防止并发产生多个有效 Token
    await prisma.$transaction([
      prisma.refreshToken.deleteMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
      prisma.refreshToken.create({
        data: {
          userId,
          token,
          expiresAt,
        },
      }),
    ]);
  } catch (error) {
    console.error("[SaveRefreshToken] 保存失败:", error);
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
    const refreshToken = await prisma.refreshToken.findFirst({
      where: {
        userId,
        token,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return refreshToken !== null;
  } catch (error) {
    console.error("[ValidateAndRefreshToken] 验证失败:", error);
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
      // 撤销特定 token
      await prisma.refreshToken.updateMany({
        where: {
          userId,
          token,
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
    console.error("[RevokeRefreshToken] 撤销失败:", error);
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
    console.error("[CleanupExpiredRefreshTokens] 清理失败:", error);
    return 0;
  }
}

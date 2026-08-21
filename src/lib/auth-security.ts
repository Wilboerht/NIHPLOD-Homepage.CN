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
import { recordSsoEvent } from "./sso-audit";

// ============================================
// 标识符哈希（LoginAttempt 表中不存储明文手机号）
// ============================================

/**
 * 对登录标识符进行单向哈希（SHA-256 前 64 字符 hex）
 * LoginAttempt 表中仅存储哈希值，防止明文手机号泄露。
 * 查询/计数时对输入同样哈希后比对。
 */
function hashIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier, "utf8").digest("hex");
}

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
 * @param clientId OAuth Client ID（来源子项目）
 */
export async function recordLoginAttempt(
  identifier: string,
  success: boolean,
  request: NextRequest,
  reason?: string,
  type: "password" | "sms" | "oauth" | "admin" = "password",
  userId?: string,
  clientId?: string
): Promise<void> {
  const ip = getClientIP(request);
  const ua = getUserAgent(request);

  try {
    await prisma.loginAttempt.create({
      data: {
        identifier: hashIdentifier(identifier),
        type,
        success,
        reason: success ? null : reason,
        ipAddress: ip,
        userAgent: ua,
        clientId,
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
      clientId,
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
        identifier: hashIdentifier(identifier),
        success: false,
        createdAt: { gte: windowStart },
      },
    });

    if (failedAttempts >= config.maxAttempts) {
      // 账户已锁定，计算剩余锁定时间
      const lastFailedAttempt = await prisma.loginAttempt.findFirst({
        where: {
          identifier: hashIdentifier(identifier),
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
 * @param identifier 登录标识
 * @param type 限制清除的登录类型（password | sms），不传则清除所有
 */
export async function clearLoginAttempts(identifier: string, type?: string): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({
      where: { identifier: hashIdentifier(identifier), ...(type ? { type } : {}) },
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

/**
 * 计算 Refresh Token 的 SHA-256 哈希（公开别名）
 * 供路由层将 Cookie 中的 refresh token 与数据库存储的哈希比对，
 * 例如改密时保留当前设备、撤销其他设备会话。
 */
export function hashRefreshToken(token: string): string {
  return hashToken(token);
}

export interface DeviceInfo {
  deviceName?: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
}

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
  // 设备指纹不再包含 IP：
  // IP 会随网络环境变化，导致同一设备被误判为多个设备；
  // 同时避免将用户网络位置信息混入不可逆指纹。
  const ua = info.deviceInfo || info.userAgent || "";
  const name = info.deviceName || "";
  return createHash("sha256").update(`${name}|${ua}`).digest("hex");
}

export async function saveRefreshToken(
  userId: string,
  token: string,
  expiresAt: Date,
  deviceInfo?: DeviceInfo,
  clientId?: string
): Promise<void> {
  try {
    const tokenHash = hashToken(token);
    const fingerprint = getDeviceFingerprint(deviceInfo);

    await prisma.$transaction(async (tx) => {
      // 1. 查找同一用户、同一 client 下的活跃 Token（按 client 隔离设备复用）
      const existingTokens = await tx.refreshToken.findMany({
        where: {
          userId,
          clientId: clientId ?? null,
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
        // 更新同一设备、同一 client 的 Token
        await tx.refreshToken.update({
          where: { id: sameDeviceToken.id },
          data: {
            token: tokenHash,
            expiresAt,
            clientId: clientId ?? sameDeviceToken.clientId,
            deviceName: deviceInfo?.deviceName ?? sameDeviceToken.deviceName,
            deviceInfo: deviceInfo?.deviceInfo ?? sameDeviceToken.deviceInfo,
            ipAddress: deviceInfo?.ipAddress ?? sameDeviceToken.ipAddress,
            userAgent: deviceInfo?.userAgent ?? sameDeviceToken.userAgent,
            revokedAt: null,
            updatedAt: new Date(),
          },
        });
      } else {
        // 2. 限制每个用户、每个 client 的最大设备数，防止无限增长
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
            clientId,
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
      reason:
        "missing" | "revoked" | "expired" | "account_disabled" | "concurrent_rotation" | "error";
      /** concurrent_rotation / revoked / missing 时存在：本次吊销的 token 家族成员数（RFC 6819 §5.2.2.3） */
      familyRevokedCount?: number;
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
  deviceInfo?: DeviceInfo,
  clientId?: string
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
        // Token 不存在（或已过期）：可能是重用已被清除/轮换的 token，按泄漏信号处理，
        // 与 revoked 分支一致吊销该用户在该 client 下的整个 token 家族（幂等，重复触发不报错）
        const familyRevoked = await tx.refreshToken.updateMany({
          where: {
            userId,
            clientId: clientId ?? null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        // 同步撤销对应 OAuthSession，确保携带 sid 的 access token 即时失效
        // （仅 OAuth 场景有会话；内部 token 无 clientId，跳过）
        if (clientId) {
          await tx.oAuthSession.updateMany({
            where: {
              userId,
              clientId,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
        }
        return {
          valid: false as const,
          reason: "missing" as const,
          familyRevokedCount: familyRevoked.count,
        };
      }

      if (existing.revokedAt) {
        // 良性并发窗口：刚被轮换（≤10 秒）视为多 Tab / 拦截器并发重发，
        // 仅拒绝本次请求、不吊销家族，避免误伤同一用户的所有设备；
        // 超出窗口才视为顺序重用已撤销的 Refresh Token（泄漏信号）
        if (Date.now() - existing.revokedAt.getTime() <= 10_000) {
          return {
            valid: false as const,
            reason: "concurrent_rotation" as const,
            familyRevokedCount: 0,
          };
        }
        // 顺序重用已撤销的 Refresh Token：明确的泄漏信号（RFC 6819 §5.2.2.3），
        // 吊销该用户在该 client 下的整个 token 家族（此前仅并发竞态分支有吊销，此处补齐）
        const familyRevoked = await tx.refreshToken.updateMany({
          where: {
            userId,
            clientId: clientId ?? null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        // 同步撤销对应 OAuthSession，确保携带 sid 的 access token 即时失效
        // （仅 OAuth 场景有会话；内部 token 无 clientId，跳过）
        if (clientId) {
          await tx.oAuthSession.updateMany({
            where: {
              userId,
              clientId,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
        }
        return {
          valid: false as const,
          reason: "revoked" as const,
          familyRevokedCount: familyRevoked.count,
        };
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
        // 并发竞态：另一个请求已先撤销此 Token。重读 revokedAt 区分良性并发与重用攻击：
        // ≤10 秒内刚被轮换 → 良性并发（多 Tab / 拦截器重发），仅拒绝本次请求不吊销家族；
        // 超出窗口才按 RFC 6819 §5.2.2.3 吊销整个 token 家族
        const reread = await tx.refreshToken.findUnique({
          where: { id: existing.id },
          select: { revokedAt: true },
        });
        if (reread?.revokedAt && Date.now() - reread.revokedAt.getTime() <= 10_000) {
          return {
            valid: false as const,
            reason: "concurrent_rotation" as const,
            familyRevokedCount: 0,
          };
        }
        const familyRevoked = await tx.refreshToken.updateMany({
          where: {
            userId,
            clientId: clientId ?? null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        return {
          valid: false as const,
          reason: "concurrent_rotation" as const,
          familyRevokedCount: familyRevoked.count,
        };
      }

      // 4. 查找同用户、同 client 下的活跃 Token（按 client 隔离设备复用）
      const existingTokens = await tx.refreshToken.findMany({
        where: {
          userId,
          clientId: clientId ?? null,
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
            clientId: clientId ?? sameDeviceToken.clientId,
            deviceName: deviceInfo?.deviceName ?? sameDeviceToken.deviceName,
            deviceInfo: deviceInfo?.deviceInfo ?? sameDeviceToken.deviceInfo,
            ipAddress: deviceInfo?.ipAddress ?? sameDeviceToken.ipAddress,
            userAgent: deviceInfo?.userAgent ?? sameDeviceToken.userAgent,
            revokedAt: null,
            updatedAt: new Date(),
          },
        });
      } else {
        // 限制每个用户、每个 client 的最大设备数
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
            clientId,
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

    // 检测到 refresh token 重用攻击：记录合规敏感的审计事件（同步 await，防止丢失）
    // revoked / missing 分支已在事务内完成家族吊销，此处统一补记审计；
    // 良性并发（familyRevokedCount = 0，未吊销任何家族成员）不产生审计噪音
    if (
      !result.valid &&
      (result.reason === "concurrent_rotation" ||
        result.reason === "revoked" ||
        result.reason === "missing") &&
      (result.familyRevokedCount ?? 0) > 0
    ) {
      await recordSsoEvent({
        event: "status_change",
        userId,
        clientId,
        success: false,
        detail: {
          action: "refresh_token_family_revoked",
          reason: result.reason,
          familyRevokedCount: result.familyRevokedCount ?? 0,
        },
      });
    }

    return result;
  } catch (error) {
    apiConsole.error("[AtomicallyRotateRefreshToken] 失败:", error);
    return { valid: false, reason: "error" };
  }
}

/**
 * 撤销 Refresh Token（登出时调用）
 * 返回实际被撤销的记录数，便于调用方检测并发重用。
 */
export async function revokeRefreshToken(
  userId: string,
  token?: string,
  clientId?: string
): Promise<number> {
  try {
    if (token) {
      // 撤销特定 token（比对哈希值），仅撤销尚未撤销的，便于检测并发重用
      const tokenHash = hashToken(token);
      const result = await prisma.refreshToken.updateMany({
        where: {
          userId,
          token: tokenHash,
          revokedAt: null,
          ...(clientId ? { clientId } : {}),
        },
        data: {
          revokedAt: new Date(),
        },
      });
      return result.count;
    } else {
      // 撤销用户所有有效 token（可指定 clientId 精确撤销）
      const result = await prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(clientId ? { clientId } : {}),
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
    apiConsole.info(`[CleanupExpiredRefreshTokens] 清理了 ${result.count} 个过期 token`);
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
    apiConsole.info(`[CleanupLoginAttempts] 清理了 ${result.count} 条陈旧登录记录`);
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
    apiConsole.info(`[CleanupSmsCodes] 清理了 ${result.count} 条过期验证码记录`);
    return result.count;
  } catch (error) {
    apiConsole.error("[CleanupSmsCodes] 清理失败:", error);
    return 0;
  }
}

/**
 * 清理已撤销的 OAuth Session 和 Refresh Token（30 天后物理删除）
 * OAuth Session 额外清理过期 30 天但未撤销的记录，避免表无限增长
 */
export async function cleanupRevokedSessionsAndTokens(): Promise<{
  sessions: number;
  tokens: number;
}> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [sessions, tokens] = await Promise.all([
      prisma.oAuthSession.deleteMany({
        where: {
          OR: [{ revokedAt: { lt: thirtyDaysAgo } }, { expiresAt: { lt: thirtyDaysAgo } }],
        },
      }),
      prisma.refreshToken.deleteMany({
        where: { revokedAt: { lt: thirtyDaysAgo } },
      }),
    ]);
    apiConsole.info(
      `[CleanupRevoked] 清理了 ${sessions.count} 个已撤销/过期会话, ${tokens.count} 个已撤销 Token`
    );
    return { sessions: sessions.count, tokens: tokens.count };
  } catch (error) {
    apiConsole.error("[CleanupRevoked] 清理失败:", error);
    return { sessions: 0, tokens: 0 };
  }
}

/**
 * 清理已撤销的 UserConsent 记录（撤销 30 天后物理删除）
 */
export async function cleanupRevokedUserConsents(): Promise<number> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.userConsent.deleteMany({
      where: { revokedAt: { lt: thirtyDaysAgo } },
    });
    apiConsole.info(`[CleanupUserConsents] 清理了 ${result.count} 条已撤销授权记录`);
    return result.count;
  } catch (error) {
    apiConsole.error("[CleanupUserConsents] 清理失败:", error);
    return 0;
  }
}

/**
 * 管理员 TOTP 一次性恢复码与短时重绑凭证。
 *
 * 设计约束：
 * - 恢复码只存 SHA-256，明文只在签发响应返回一次；
 * - 10 分钟有效、单次使用，消费使用 updateMany 原子占位；
 * - 使用恢复码后清空旧 TOTP，并要求管理员在短时 setup cookie 内重新绑定；
 * - setup token 绑定 adminId + tokenVersion，旧 token 在再次重置后自动失效。
 */
import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { getIssuer } from "@/lib/oauth-constants";

export const ADMIN_TOTP_RECOVERY_TTL_MINUTES = 10;
export const ADMIN_TOTP_RECOVERY_TTL_MS = ADMIN_TOTP_RECOVERY_TTL_MINUTES * 60 * 1000;
export const ADMIN_TOTP_SETUP_TTL_SECONDS = 10 * 60;
export const ADMIN_TOTP_SETUP_COOKIE_NAME = "__Host-admin_totp_setup";
export const ADMIN_TOTP_SETUP_AUDIENCE = "admin-totp-setup";

export const ADMIN_TOTP_SETUP_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: ADMIN_TOTP_SETUP_TTL_SECONDS,
};

function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function getSetupSecret(): Uint8Array {
  const secret = process.env.JWT_ADMIN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("[AdminTOTPRecovery] JWT_ADMIN_SECRET 未配置或长度不足 32 位");
  }
  return new TextEncoder().encode(secret);
}

/** 32 位十六进制恢复码，足够避免猜测；登录页按普通验证码字段接收。 */
export function generateAdminTotpRecoveryCode(): string {
  return randomBytes(16).toString("hex");
}

export function isAdminTotpRecoveryCodeFormat(code: string): boolean {
  return /^[0-9a-f]{32}$/i.test(code.trim());
}

export interface CreateAdminTotpRecoveryParams {
  adminId: string;
  createdBy: string;
  reason: string;
}

export async function createAdminTotpRecovery(
  params: CreateAdminTotpRecoveryParams
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateAdminTotpRecoveryCode();
  const expiresAt = new Date(Date.now() + ADMIN_TOTP_RECOVERY_TTL_MS);

  await prisma.$transaction(async (tx) => {
    // 同一管理员只保留一个未使用恢复码，避免旧码长期悬挂
    await tx.adminTotpRecovery.deleteMany({
      where: { adminId: params.adminId, usedAt: null },
    });
    await tx.adminTotpRecovery.create({
      data: {
        adminId: params.adminId,
        createdBy: params.createdBy,
        tokenHash: hashRecoveryCode(code),
        reason: params.reason,
        expiresAt,
      },
    });
  });

  return { code, expiresAt };
}

/** 原子消费恢复码；只有 count=1 才算成功（并发/过期/已使用均拒绝）。 */
export async function consumeAdminTotpRecoveryCode(
  adminId: string,
  code: string
): Promise<boolean> {
  const normalized = code.trim().toLowerCase();
  if (!isAdminTotpRecoveryCodeFormat(normalized)) return false;

  const result = await prisma.adminTotpRecovery.updateMany({
    where: {
      adminId,
      tokenHash: hashRecoveryCode(normalized),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });

  return result.count === 1;
}

/**
 * 消费恢复码并在同一事务内清空目标 TOTP、递增 tokenVersion。
 * 返回新的 tokenVersion；恢复码无效/过期/并发使用时返回 null。
 */
export async function consumeAdminTotpRecoveryAndReset(
  adminId: string,
  code: string
): Promise<{ tokenVersion: number } | null> {
  const normalized = code.trim().toLowerCase();
  if (!isAdminTotpRecoveryCodeFormat(normalized)) return null;

  return prisma.$transaction(async (tx) => {
    const consumed = await tx.adminTotpRecovery.updateMany({
      where: {
        adminId,
        tokenHash: hashRecoveryCode(normalized),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return null;

    const updated = await tx.admin.update({
      where: { id: adminId },
      data: {
        totpEnabled: false,
        totpResetRequired: true,
        totpSecret: null,
        totpBackupCodes: null,
        tokenVersion: { increment: 1 },
      },
      select: { tokenVersion: true },
    });

    return { tokenVersion: updated.tokenVersion };
  });
}

export async function cleanupExpiredAdminTotpRecoveries(): Promise<number> {
  const result = await prisma.adminTotpRecovery.deleteMany({
    where: {
      OR: [
        { usedAt: null, expiresAt: { lt: new Date() } },
        { usedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  return result.count;
}

export async function signAdminTotpSetupToken(params: {
  adminId: string;
  tokenVersion: number;
}): Promise<string> {
  return new SignJWT({
    adminId: params.adminId,
    ver: params.tokenVersion,
    type: "admin_totp_setup",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(getIssuer())
    .setAudience(ADMIN_TOTP_SETUP_AUDIENCE)
    .setSubject(params.adminId)
    .setJti(randomBytes(16).toString("hex"))
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TOTP_SETUP_TTL_SECONDS}s`)
    .sign(getSetupSecret());
}

export async function verifyAdminTotpSetupToken(
  token: string
): Promise<{ adminId: string; tokenVersion: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSetupSecret(), {
      issuer: getIssuer(),
      audience: ADMIN_TOTP_SETUP_AUDIENCE,
      algorithms: ["HS256"],
    });
    if (
      payload.type !== "admin_totp_setup" ||
      typeof payload.sub !== "string" ||
      typeof payload.ver !== "number"
    ) {
      return null;
    }
    return {
      adminId: payload.sub,
      tokenVersion: payload.ver,
    };
  } catch {
    return null;
  }
}

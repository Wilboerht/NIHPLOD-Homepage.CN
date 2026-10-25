/**
 * 管理员敏感操作 step-up（sudo mode）凭证。
 *
 * 设计目标：
 * - 一次 TOTP 验证后，在短时间内复用，避免每个敏感操作都重复输入验证码；
 * - Cookie 仅保存随机 token，数据库只保存 SHA-256 hash；
 * - 绑定管理员、当前会话 jti、tokenVersion，改密/改权限/登出后自动失效；
 * - 绝对过期，不做滑动续期。
 */
import { createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import type { AdminJWTPayload } from "@/types/auth";

export const ADMIN_STEP_UP_COOKIE_NAME = "__Host-nihplod_admin_step_up";
export const ADMIN_STEP_UP_SCOPE = "sensitive";

function parseTtlSeconds(): number {
  const raw = Number(process.env.ADMIN_STEP_UP_TTL_SECONDS);
  if (!Number.isFinite(raw)) return 600;
  return Math.min(3600, Math.max(60, Math.floor(raw)));
}

export const ADMIN_STEP_UP_TTL_SECONDS = parseTtlSeconds();

export const ADMIN_STEP_UP_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: ADMIN_STEP_UP_TTL_SECONDS,
};

type AdminStepUpSubject = Pick<AdminJWTPayload, "id" | "ver" | "jti">;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueAdminStepUpGrant(
  admin: AdminStepUpSubject
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const sessionJti = admin.jti ?? null;
  const expiresAt = new Date(Date.now() + ADMIN_STEP_UP_TTL_SECONDS * 1000);

  await prisma.$transaction(async (tx) => {
    // 同一会话只保留一个有效 grant，避免反复验证积累记录。
    await tx.adminStepUpGrant.deleteMany({
      where: { adminId: admin.id, sessionJti },
    });
    await tx.adminStepUpGrant.create({
      data: {
        tokenHash,
        adminId: admin.id,
        sessionJti,
        tokenVersion: admin.ver ?? 0,
        scope: ADMIN_STEP_UP_SCOPE,
        expiresAt,
      },
    });
  });

  return { token, expiresAt };
}

export async function verifyAdminStepUpGrant(
  request: NextRequest,
  admin: AdminStepUpSubject
): Promise<boolean> {
  const token = request.cookies.get(ADMIN_STEP_UP_COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    const grant = await prisma.adminStepUpGrant.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        adminId: true,
        sessionJti: true,
        tokenVersion: true,
        scope: true,
        expiresAt: true,
        admin: { select: { totpEnabled: true } },
      },
    });
    if (!grant) return false;

    return (
      grant.adminId === admin.id &&
      grant.sessionJti === (admin.jti ?? null) &&
      grant.tokenVersion === (admin.ver ?? 0) &&
      grant.scope === ADMIN_STEP_UP_SCOPE &&
      grant.admin.totpEnabled &&
      grant.expiresAt > new Date()
    );
  } catch {
    // 数据库异常时回退到逐次 TOTP，不能因 grant 查询失败而放行。
    return false;
  }
}

export async function revokeAdminStepUpGrantsForSession(
  adminId: string,
  sessionJti: string | null
): Promise<void> {
  await prisma.adminStepUpGrant.deleteMany({
    where: { adminId, sessionJti },
  });
}

export async function revokeAllAdminStepUpGrants(adminId: string): Promise<void> {
  await prisma.adminStepUpGrant.deleteMany({ where: { adminId } });
}

export async function cleanupExpiredAdminStepUpGrants(): Promise<number> {
  const result = await prisma.adminStepUpGrant.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

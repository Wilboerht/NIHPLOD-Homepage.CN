/**
 * 管理员登录账户级防爆破锁定检查
 * （从 /api/admin/login 路由提取：Next.js route 文件不允许导出非 HTTP 方法的符号）
 */
import prisma from "@/lib/prisma";
import { hashIdentifier } from "@/lib/auth-security";

// 管理员账户级防爆破配置
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_WINDOW_MS = 15 * 60 * 1000; // 15 分钟
const ADMIN_LOCKOUT_MS = 30 * 60 * 1000; // 30 分钟

export async function checkAdminLockout(
  email: string
): Promise<{ locked: boolean; remainingMinutes: number }> {
  // HMAC（LOGIN_ATTEMPT_HMAC_KEY）：与用户侧一致，避免拖库后邮箱被枚举还原
  const identifier = hashIdentifier(email);
  // 计数窗口至少覆盖锁定周期：若窗口（15m）短于锁定时长（30m），
  // 失败记录滑出窗口后计数归零，锁定会被提前解除（30 分钟锁定最多只生效 15 分钟）。
  // 与用户侧 checkAccountLockout 同口径（lib/auth-security.ts）
  const effectiveWindowMs = Math.max(ADMIN_WINDOW_MS, ADMIN_LOCKOUT_MS);
  const windowStart = new Date(Date.now() - effectiveWindowMs);
  const failedAttempts = await prisma.loginAttempt.count({
    where: {
      identifier,
      type: "admin",
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  if (failedAttempts >= ADMIN_MAX_ATTEMPTS) {
    const lastFailed = await prisma.loginAttempt.findFirst({
      where: { identifier, type: "admin", success: false, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "desc" },
    });
    if (lastFailed) {
      const remainingMs = lastFailed.createdAt.getTime() + ADMIN_LOCKOUT_MS - Date.now();
      if (remainingMs > 0) {
        return { locked: true, remainingMinutes: Math.ceil(remainingMs / 60 / 1000) };
      }
    }
  }

  return { locked: false, remainingMinutes: 0 };
}

/**
 * 安全中心 · 登录历史共享核心
 *
 * 网页会话路由（/api/user/login-history）与 OAuth 资源端点
 * （/api/oauth/security/login-history）共用。
 */
import { prisma } from "@/lib/prisma";
import { maskIp } from "@/lib/mask-phone";
import { hashIdentifier } from "@/lib/auth-security";

export interface LoginHistoryView {
  id: string;
  type: string;
  success: boolean;
  reason: string | null;
  ipAddress: string;
  createdAt: string;
}

/**
 * 最近登录尝试记录（默认 50 条）。
 * 登录历史按账号（userId）聚合优先；历史行无 userId（2026-09 之前写入），
 * 以 identifier 哈希（手机号）兜底查询。用户不存在时返回 null。
 */
export async function listSecurityLoginHistory(
  userId: string,
  take = 50
): Promise<LoginHistoryView[] | null> {
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  if (!userRecord) return null;

  const attempts = await prisma.loginAttempt.findMany({
    where: {
      OR: [{ userId }, { identifier: hashIdentifier(userRecord.phone) }],
    },
    select: {
      id: true,
      identifier: true,
      type: true,
      success: true,
      reason: true,
      ipAddress: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return attempts.map((a) => ({
    id: a.id,
    type: a.type,
    success: a.success,
    reason: a.reason,
    // 末段脱敏：不向用户端暴露精确主机 IP
    ipAddress: a.ipAddress ? maskIp(a.ipAddress) : "未知 IP",
    createdAt: a.createdAt.toISOString(),
  }));
}

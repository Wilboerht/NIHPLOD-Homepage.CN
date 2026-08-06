/**
 * SSO 审计事件日志
 *
 * 记录所有 OAuth/SSO 关键事件：authorize、token、introspect、userinfo、logout 等。
 * 用于安全审计、异常检测和合规检查。
 */
import { prisma } from "./prisma";
import { apiConsole } from "@/lib/logger";

export type SsoEventType =
  | "authorize"
  | "token"
  | "introspect"
  | "userinfo"
  | "backchannel_logout"
  | "logout"
  | "consent"
  | "status_change";

export interface SsoEventContext {
  event: SsoEventType;
  userId?: string;
  clientId?: string;
  clientName?: string;
  ip?: string;
  userAgent?: string;
  detail?: Record<string, unknown>;
  success?: boolean;
}

/**
 * 记录 SSO 事件（异步写入，不阻塞主流程）
 */
export function recordSsoEvent(context: SsoEventContext): void {
  // 先写 console（DB 宕机时仍有冗余日志），
  // 再异步写数据库（不阻塞主流程）
  const info = { event: context.event, userId: context.userId, clientId: context.clientId, ip: context.ip, success: context.success ?? true };
  apiConsole.info(`[SsoAudit] ${context.event}`, info);

  prisma.ssoAuditEvent
    .create({
      data: {
        event: context.event,
        userId: context.userId || null,
        clientId: context.clientId || null,
        clientName: context.clientName || null,
        ip: context.ip || null,
        userAgent: context.userAgent || null,
        detail: context.detail ? (context.detail as object) : undefined,
        success: context.success ?? true,
      },
    })
    .catch((error) => {
      apiConsole.error(`[SsoAudit] 持久化失败 (${context.event}):`, error);
    });
}

/**
 * 清理 90 天前的 SSO 审计事件
 */
export async function cleanupOldSsoAuditEvents(): Promise<number> {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await prisma.ssoAuditEvent.deleteMany({
      where: { createdAt: { lt: ninetyDaysAgo } },
    });
    return result.count;
  } catch (error) {
    apiConsole.error("[SsoAudit] 清理旧记录失败:", error);
    return 0;
  }
}

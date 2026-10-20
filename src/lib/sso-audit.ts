/**
 * SSO 审计事件日志
 *
 * 记录所有 OAuth/SSO 关键事件：authorize、token、introspect、userinfo、logout 等。
 * 用于安全审计、异常检测和合规检查。
 */
import { after } from "next/server";
import { prisma } from "./prisma";
import { apiConsole } from "@/lib/logger";
import { isAuditArchiveReady } from "./audit-integrity";

export type SsoEventType =
  | "authorize"
  | "token"
  | "introspect"
  | "userinfo"
  | "backchannel_logout"
  | "profile_webhook"
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
 * 记录 SSO 事件
 *
 * 默认 fire-and-forget 写入数据库，不阻塞主流程；函数返回 Promise，
 * 合规敏感事件（consent 吊销、status_change、token 家族吊销等）的调用方
 * 应 `await recordSsoEvent(...)` 同步等待，防止进程崩溃导致审计记录丢失。
 * Next.js 路由处理器中的非合规敏感事件请改用 scheduleSsoEvent()（after 注册，
 * 避免 serverless 响应返回后进程冻结导致写库丢失）。
 * console 日志始终先写（DB 宕机时仍有冗余日志）。
 */
export function recordSsoEvent(context: SsoEventContext): Promise<void> {
  const info = {
    event: context.event,
    userId: context.userId,
    clientId: context.clientId,
    ip: context.ip,
    success: context.success ?? true,
  };
  apiConsole.info(`[SsoAudit] ${context.event}`, info);

  return prisma.ssoAuditEvent
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
    .then(() => undefined)
    .catch((error) => {
      apiConsole.error(`[SsoAudit] 持久化失败 (${context.event}):`, error);
    });
}

/**
 * 在响应返回后调度 SSO 事件写库（Next.js 路由处理器专用）
 *
 * 解决 serverless 下 fire-and-forget 丢日志问题：响应返回后进程可能被冻结，
 * 未完成的 prisma 写库随之丢失。通过 next/server 的 `after()`（Next 16 已稳定）
 * 注册回调，平台保证响应发送后仍等待回调执行完成。
 *
 * `after()` 只能在 request scope 使用（非请求场景同步抛 E468），
 * 此时 catch 降级为 fire-and-forget promise，行为与直接调用 recordSsoEvent 一致。
 *
 * 合规敏感事件仍应 `await recordSsoEvent(...)` 同步等待，勿用本函数替代。
 */
export function scheduleSsoEvent(context: SsoEventContext): void {
  try {
    after(() => recordSsoEvent(context));
  } catch {
    // 非请求场景（如 lib 内部、脚本、测试环境无 request scope）：降级为直接 promise
    void recordSsoEvent(context);
  }
}

export { escapeCSV } from "./csv";

/**
 * 清理 90 天前的 SSO 审计事件
 */
export function getSsoAuditRetentionDays(): number {
  const raw = Number(process.env.SSO_AUDIT_RETENTION_DAYS ?? 730);
  if (!Number.isFinite(raw)) return 730;
  return Math.min(Math.max(Math.floor(raw), 30), 3650);
}

export async function cleanupOldSsoAuditEvents(): Promise<number> {
  try {
    const retentionDays = getSsoAuditRetentionDays();
    if (!isAuditArchiveReady()) {
      apiConsole.warn(
        `[SsoAudit] 审计归档存储未就绪，跳过 ${retentionDays} 天前 SSO 审计的物理删除（fail-closed）`
      );
      return 0;
    }
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await prisma.ssoAuditEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  } catch (error) {
    apiConsole.error("[SsoAudit] 清理旧记录失败:", error);
    throw error;
  }
}

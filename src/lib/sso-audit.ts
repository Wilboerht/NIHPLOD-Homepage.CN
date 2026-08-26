/**
 * SSO 审计事件日志
 *
 * 记录所有 OAuth/SSO 关键事件：authorize、token、introspect、userinfo、logout 等。
 * 用于安全审计、异常检测和合规检查。
 */
import { after } from "next/server";
import { prisma } from "./prisma";
import { apiConsole } from "@/lib/logger";

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

/**
 * CSV 单元格转义（SSO 审计日志导出用）
 *
 * 顺序要求：先做公式注入防护（前置单引号），再做引号转义与包裹——
 * 若先包裹引号再判断开头字符，"=..."开头且含逗号的单元格会以引号开头而绕过防护。
 */
export function escapeCSV(val: string): string {
  // 1. 防公式注入：以 = + - @ 或制表符开头的单元格先加单引号前缀
  let escaped = /^[=+\-@\t]/.test(val) ? `'${val}` : val;
  // 2. 转义双引号（CSV 标准：用两个双引号表示一个引号字符）
  escaped = escaped.replace(/"/g, '""');
  // 3. 包含逗号、双引号、换行或制表符时用双引号包裹
  if (/[",\n\r\t]/.test(escaped)) {
    escaped = `"${escaped}"`;
  }
  return escaped;
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

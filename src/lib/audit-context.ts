/**
 * 审计上下文：统一注入操作者快照、会话 jti、认证方式与来源。
 */
import type { AuditActorType } from "@/generated/prisma/client";
import type { AuditLogInput } from "./audit";
import { getClientIP } from "./client-ip";

export interface AuditAdminLike {
  id: string;
  email: string;
  name: string;
  role: string;
  jti?: string | null;
}

export interface AuditContextOptions {
  authMethod?: string;
  source?: AuditLogInput["source"];
  actorType?: AuditActorType;
}

/** 管理端操作：自动补齐 actor 快照 + sessionJti + source。 */
export function adminAuditContext(
  admin: AuditAdminLike,
  request?: Request,
  options: AuditContextOptions = {}
): Partial<AuditLogInput> {
  return {
    actorType: options.actorType ?? "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    authMethod: options.authMethod ?? "session",
    sessionJti: admin.jti ?? null,
    adminId: admin.id,
    source: options.source ?? "WEB",
    ...(request ? { request } : {}),
  };
}

/** 系统任务（cron / 后台修复）。 */
export function systemAuditContext(options: AuditContextOptions = {}): Partial<AuditLogInput> {
  return {
    actorType: "SYSTEM",
    authMethod: options.authMethod ?? "system",
    source: options.source ?? "CRON",
  };
}

/** 内部服务调用（签名 API / 集成）。 */
export function integrationAuditContext(
  request?: Request,
  options: AuditContextOptions = {}
): Partial<AuditLogInput> {
  return {
    actorType: "INTEGRATION",
    authMethod: options.authMethod ?? "internal_api",
    source: options.source ?? "INTEGRATION",
    ...(request ? { request } : {}),
  };
}

/** 审计日志里记录 IP 时统一走客户端 IP 解析，避免各处取值不一致。 */
export function auditRequestIP(request: Request): string {
  return getClientIP(request);
}

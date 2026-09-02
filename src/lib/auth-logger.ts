/**
 * 认证链路审计日志
 *
 * 用于记录用户/管理员登录、登出、Token 刷新、密码修改等关键安全事件。
 * 日志中包含脱敏后的标识符、IP、UA、结果、原因等信息，便于安全审计和异常排查。
 */

import { apiConsole } from "@/lib/logger";
import { createAuditLog } from "./audit";
import { maskPhone } from "./mask-phone";

export type AuthEventType =
  | "user_login"
  | "user_logout"
  | "user_register"
  | "user_refresh_token"
  | "refresh_token_reuse_detected"
  | "user_reset_password"
  | "user_set_password"
  | "user_phone_changed"
  | "send_sms_code"
  | "admin_login"
  | "admin_logout"
  | "admin_create"
  | "admin_update"
  | "internal_api_call"
  | "wechat_bind"
  | "user_oauth_revoke"
  | "device_force_logout";

interface AuthLogContext {
  identifier?: string;
  userId?: string;
  adminId?: string;
  clientId?: string;
  ip?: string;
  ua?: string | null;
  success?: boolean;
  reason?: string;
  type?: string;
  project?: string;
  [key: string]: unknown;
}

function maskIdentifier(identifier?: string): string | undefined {
  if (!identifier) return undefined;

  // 邮箱
  if (identifier.includes("@")) {
    const [local, domain] = identifier.split("@");
    if (local.length <= 2) return `*@${domain}`;
    return `${local.slice(0, 2)}****${local.slice(-2)}@${domain}`;
  }

  // 手机号：复用 maskPhone 避免重复实现
  return maskPhone(identifier);
}

/**
 * Auth 事件到 Audit action 的映射
 * 注意：auth-logger 的 event 命名与 AuditAction 不完全一致
 */
function mapEventToAuditAction(event: AuthEventType): string | null {
  const mapping: Record<string, string> = {
    user_login: "user_login",
    user_logout: "user_logout",
    user_register: "user_register",
    user_reset_password: "user_reset_password",
    user_set_password: "user_set_password",
    user_phone_changed: "user_phone_changed",
    wechat_bind: "user_wechat_bind",
    user_oauth_revoke: "user_oauth_revoke",
    admin_login: "admin_login",
    admin_logout: "admin_logout",
    refresh_token_reuse_detected: "refresh_token_reuse_detected",
  };
  return mapping[event] || null;
}

/**
 * 记录认证事件
 */
export function logAuthEvent(event: AuthEventType, context: AuthLogContext): void {
  const { identifier, success, ip, ua, reason, ...rest } = context;

  const logPayload: Record<string, unknown> = {
    event,
    success,
    identifier: maskIdentifier(identifier),
    ip,
    ua,
    reason,
    ...rest,
  };

  // 移除 undefined 字段
  Object.keys(logPayload).forEach((key) => {
    if (logPayload[key] === undefined) {
      delete logPayload[key];
    }
  });

  if (success) {
    apiConsole.info(`[AuthAudit] ${event}`, logPayload);
  } else {
    apiConsole.warn(`[AuthAudit] ${event} failed`, logPayload);
  }

  // 关键 C 端安全事件持久化到审计日志
  const persistentEvents: AuthEventType[] = [
    "user_login",
    "user_logout",
    "user_register",
    "user_reset_password",
    "user_set_password",
    "user_phone_changed",
    "wechat_bind",
    "user_oauth_revoke",
    "admin_login",
    "admin_logout",
    "refresh_token_reuse_detected",
  ];

  if (persistentEvents.includes(event)) {
    const auditAction = mapEventToAuditAction(event);
    if (!auditAction) return;

    const targetType = event === "wechat_bind" ? "user" : "system";
    const targetId = context.userId;

    createAuditLog({
      action: auditAction as
        | "user_login"
        | "user_logout"
        | "user_register"
        | "user_reset_password"
        | "user_phone_changed"
        | "user_wechat_bind"
        | "user_oauth_revoke",
      targetType,
      targetId,
      detail: logPayload,
      userId: context.userId,
    }).catch((error) => {
      apiConsole.error("[AuthAudit] 持久化审计日志失败:", error);
    });
  }
}

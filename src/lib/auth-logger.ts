/**
 * 认证链路审计日志
 *
 * 用于记录用户/管理员登录、登出、Token 刷新、密码修改等关键安全事件。
 * 日志中包含脱敏后的标识符、IP、UA、结果、原因等信息，便于安全审计和异常排查。
 */

import { apiConsole } from "@/lib/logger";

export type AuthEventType =
  | "user_login"
  | "user_logout"
  | "user_register"
  | "user_refresh_token"
  | "user_reset_password"
  | "user_set_password"
  | "send_sms_code"
  | "admin_login"
  | "admin_logout"
  | "admin_create"
  | "admin_update"
  | "internal_api_call"
  | "wechat_bind";

interface AuthLogContext {
  identifier?: string;
  userId?: string;
  adminId?: string;
  ip?: string;
  ua?: string | null;
  success: boolean;
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

  // 手机号
  if (identifier.length >= 7) {
    return `${identifier.slice(0, 3)}****${identifier.slice(-4)}`;
  }

  return identifier;
}

/**
 * 记录认证事件
 */
export function logAuthEvent(
  event: AuthEventType,
  context: AuthLogContext
): void {
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
}

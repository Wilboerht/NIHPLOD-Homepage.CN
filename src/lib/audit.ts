/**
 * 审计日志服务
 * 记录管理端关键操作，便于追溯和合规审计
 */
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { getClientIP } from "./ratelimit";
import { Prisma } from "@/generated/prisma/client";
import type { AuditActorType, AuditOutcome } from "@/generated/prisma/client";
import { apiConsole } from "@/lib/logger";
import { isAuditArchiveReady } from "@/lib/audit-integrity";

function sanitizeUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  return ua.replace(/[<>]/g, "").slice(0, 500);
}

export type AuditAction =
  | "login"
  | "logout"
  | "ship_order"
  | "update_order"
  | "refund_approve"
  | "refund_reject"
  | "create_admin"
  | "update_admin"
  | "delete_admin"
  | "create_product"
  | "update_product"
  | "delete_product"
  | "batch_product"
  | "create_category"
  | "update_category"
  | "delete_category"
  | "create_job"
  | "update_job"
  | "delete_job"
  | "batch_job"
  | "update_application"
  | "delete_application"
  | "create_application_folder"
  | "update_application_folder"
  | "delete_application_folder"
  | "reorder_categories"
  | "update_message"
  | "delete_message"
  | "batch_message"
  | "create_coupon"
  | "update_coupon"
  | "delete_coupon"
  | "batch_coupon"
  | "run_cron_task"
  | "user_login"
  | "user_logout"
  | "user_register"
  | "user_reset_password"
  | "user_wechat_bind"
  | "user_oauth_revoke"
  | "user_phone_changed"
  | "device_force_logout"
  | "user_status_change"
  | "user_deleted"
  | "user_detail_view"
  | "user_detail_sensitive_view"
  | "application_detail_view"
  | "resume_download"
  | "step_up_granted"
  | "user_birthday_update"
  | "user_password_reset"
  | "user_identity_unbind"
  | "user_points_adjust"
  | "update_vip_benefit"
  | "submit_spent_adjustment"
  | "approve_spent_adjustment"
  | "reject_spent_adjustment"
  | "undo_spent_adjustment"
  | "import_spent_records"
  | "undo_spent_import"
  | "point_gift_create"
  | "point_gift_update"
  | "point_redemption_fulfill"
  | "point_redemption_waybill_update"
  | "point_redemption_cancel"
  | "create_point_campaign"
  | "update_point_campaign"
  | "delete_point_campaign"
  | "oauth_client_create"
  | "oauth_client_update"
  | "oauth_client_delete"
  | "oauth_client_rotate_secret"
  | "oauth_client_test"
  | "oauth_consent_revoke"
  | "oauth_session_terminate"
  | "webhook_failure_retry"
  | "webhook_failure_delete"
  | "user_set_password"
  | "admin_login"
  | "admin_logout"
  | "admin_totp_recovery_issued"
  | "admin_totp_recovery_used"
  | "refresh_token_reuse_detected"
  | "sso_audit_export"
  | "user_export"
  | "audit_log_export"
  | "account_deletion_request"
  | "account_deletion_cancel"
  | "account_deletion_execute"
  | "account_deletion_retry"
  | "admin_sso_authorize"
  | "admin_sso_token"
  | "admin_sso_denied"
  | "break_glass_view"
  | "admin_login_failed"
  | "admin_totp_failed"
  | "amap_config_view"
  | "spent_receipt_view"
  | "spent_import_preview"
  | "application_list_view"
  | "audit_log_view"
  | "sso_audit_view"
  | "step_up_failed";

export type AuditTargetType =
  | "order"
  | "admin"
  | "user"
  | "product"
  | "category"
  | "job"
  | "message"
  | "application"
  | "coupon"
  | "system"
  | "application_folder"
  | "oauth_client"
  | "oauth_consent"
  | "vip"
  | "spent_adjustment"
  | "spent_import"
  | "point_gift"
  | "point_redemption"
  | "oauth_session"
  | "point_campaign";

export const AUDIT_ACTIONS = [
  "login",
  "logout",
  "ship_order",
  "update_order",
  "refund_approve",
  "refund_reject",
  "create_admin",
  "update_admin",
  "delete_admin",
  "create_product",
  "update_product",
  "delete_product",
  "batch_product",
  "create_category",
  "update_category",
  "delete_category",
  "create_job",
  "update_job",
  "delete_job",
  "batch_job",
  "update_application",
  "delete_application",
  "create_application_folder",
  "update_application_folder",
  "delete_application_folder",
  "reorder_categories",
  "update_message",
  "delete_message",
  "batch_message",
  "create_coupon",
  "update_coupon",
  "delete_coupon",
  "batch_coupon",
  "run_cron_task",
  "user_login",
  "user_logout",
  "user_register",
  "user_reset_password",
  "user_wechat_bind",
  "user_oauth_revoke",
  "user_status_change",
  "user_deleted",
  "user_detail_view",
  "user_detail_sensitive_view",
  "application_detail_view",
  "resume_download",
  "step_up_granted",
  "user_birthday_update",
  "user_password_reset",
  "user_identity_unbind",
  "user_points_adjust",
  "update_vip_benefit",
  "submit_spent_adjustment",
  "approve_spent_adjustment",
  "reject_spent_adjustment",
  "undo_spent_adjustment",
  "import_spent_records",
  "undo_spent_import",
  "point_gift_create",
  "point_gift_update",
  "point_redemption_fulfill",
  "point_redemption_waybill_update",
  "point_redemption_cancel",
  "create_point_campaign",
  "update_point_campaign",
  "delete_point_campaign",
  "oauth_client_create",
  "oauth_client_update",
  "oauth_client_delete",
  "oauth_client_rotate_secret",
  "oauth_client_test",
  "oauth_consent_revoke",
  "oauth_session_terminate",
  "webhook_failure_retry",
  "webhook_failure_delete",
  "user_set_password",
  "user_phone_changed",
  "admin_login",
  "admin_logout",
  "admin_totp_recovery_issued",
  "admin_totp_recovery_used",
  "refresh_token_reuse_detected",
  "sso_audit_export",
  "user_export",
  "audit_log_export",
  "account_deletion_request",
  "account_deletion_cancel",
  "account_deletion_execute",
  "account_deletion_retry",
  "admin_sso_authorize",
  "admin_sso_token",
  "admin_sso_denied",
  "break_glass_view",
  "device_force_logout",
  "admin_login_failed",
  "admin_totp_failed",
  "amap_config_view",
  "spent_receipt_view",
  "spent_import_preview",
  "application_list_view",
  "audit_log_view",
  "sso_audit_view",
  "step_up_failed",
] as const;

export const AUDIT_TARGET_TYPES = [
  "order",
  "admin",
  "user",
  "product",
  "category",
  "job",
  "message",
  "application",
  "coupon",
  "system",
  "application_folder",
  "oauth_client",
  "oauth_consent",
  "oauth_session",
  "vip",
  "spent_adjustment",
  "spent_import",
  "point_gift",
  "point_redemption",
  "point_campaign",
] as const;

export interface AuditLogInput {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  targetLabel?: string;
  detail?: Record<string, unknown>;
  outcome?: AuditOutcome;
  requestId?: string;
  actorType?: AuditActorType;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  authMethod?: string;
  sessionJti?: string;
  legalHold?: boolean;
  adminId?: string;
  userId?: string;
  request?: Request;
}

const SENSITIVE_DETAIL_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "clientSecret",
  "secret",
  "totpSecret",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
]);

const AUDIT_DETAIL_MAX_BYTES = 64 * 1024;

function redactAuditDetail(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactAuditDetail(item));
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" && value.length > 4000
      ? `${value.slice(0, 4000)}…[truncated]`
      : value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_DETAIL_KEYS.has(key) ? "[REDACTED]" : redactAuditDetail(item);
  }
  return result;
}

function prepareDetail(detail?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  if (!detail) return undefined;
  const redacted = redactAuditDetail(detail);
  const serialized = JSON.stringify(redacted);
  if (serialized.length <= AUDIT_DETAIL_MAX_BYTES) {
    return redacted as Prisma.InputJsonValue;
  }
  return {
    truncated: true,
    preview: serialized.slice(0, AUDIT_DETAIL_MAX_BYTES),
  };
}

const requestIdCache = new WeakMap<object, string>();

function resolveRequestId(request?: Request): string | undefined {
  if (!request) return undefined;
  const headerId = request.headers.get("x-request-id") || request.headers.get("x-correlation-id");
  if (headerId) return headerId.slice(0, 128);

  const cached = requestIdCache.get(request);
  if (cached) return cached;
  const generated = randomUUID();
  requestIdCache.set(request, generated);
  return generated;
}

function buildAuditData(input: AuditLogInput): Prisma.AuditLogUncheckedCreateInput {
  return {
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    detail: prepareDetail(input.detail),
    outcome: input.outcome ?? "SUCCESS",
    requestId: input.requestId ?? resolveRequestId(input.request),
    actorType: input.actorType ?? (input.userId ? "USER" : input.adminId ? "ADMIN" : "SYSTEM"),
    actorEmail: input.actorEmail,
    actorName: input.actorName,
    actorRole: input.actorRole,
    authMethod: input.authMethod,
    sessionJti: input.sessionJti,
    legalHold: input.legalHold ?? false,
    ipAddress: input.request ? getClientIP(input.request) : null,
    userAgent: sanitizeUserAgent(input.request?.headers.get("user-agent") ?? null),
    adminId: input.adminId,
    userId: input.userId,
  };
}

/** 事务内写入审计；失败会向上抛出并回滚业务事务。 */
export async function createAuditLogTx(
  tx: Prisma.TransactionClient,
  input: AuditLogInput
): Promise<string> {
  const log = await tx.auditLog.create({
    data: buildAuditData(input),
    select: { id: true },
  });
  return log.id;
}

/**
 * 在业务变更前写一条 PENDING 审计。
 * 返回 null 表示无法建立审计意图，调用方必须拒绝执行敏感操作。
 */
export async function beginAuditLog(input: AuditLogInput): Promise<string | null> {
  try {
    const log = await prisma.auditLog.create({
      data: buildAuditData({ ...input, outcome: "PENDING" }),
      select: { id: true },
    });
    return log.id;
  } catch (error) {
    apiConsole.error("[AuditLog] 预写审计失败，拒绝执行操作:", error);
    return null;
  }
}

/** 更新 PENDING 审计的最终结果；失败仅告警，记录仍保留 PENDING 供对账。 */
export async function finishAuditLog(
  id: string,
  outcome: Exclude<AuditOutcome, "PENDING">,
  detail?: Record<string, unknown>,
  targetId?: string
): Promise<boolean> {
  try {
    await prisma.auditLog.update({
      where: { id },
      data: {
        outcome,
        ...(targetId ? { targetId } : {}),
        ...(detail ? { detail: prepareDetail(detail) } : {}),
      },
    });
    return true;
  } catch (error) {
    apiConsole.error("[AuditLog] 完成审计更新失败:", error);
    return false;
  }
}

/**
 * 写入审计日志
 * @returns 是否写入成功
 */
export async function createAuditLog(input: AuditLogInput): Promise<boolean> {
  try {
    // 在测试环境或 prisma 未完整初始化时，auditLog 可能不可用
    if (!prisma.auditLog) {
      return false;
    }

    await prisma.auditLog.create({ data: buildAuditData(input) });
    return true;
  } catch (error) {
    // 审计日志写入失败不应静默忽略，至少记录到 console 并返回失败
    apiConsole.error("[AuditLog] 写入失败:", error);
    return false;
  }
}

/** 关键操作使用：审计写入失败时抛错，由调用方回滚/拒绝返回成功。 */
export async function createAuditLogStrict(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({ data: buildAuditData(input) });
}

/**
 * 批量查询审计日志（带分页）
 */
export async function listAuditLogs(options: {
  page: number;
  pageSize: number;
  action?: string;
  targetType?: string;
  adminId?: string;
  outcome?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const {
    page: rawPage,
    pageSize: rawPageSize,
    action,
    targetType,
    adminId,
    outcome,
    startDate,
    endDate,
  } = options;
  const page = Math.min(rawPage, 1000); // 防止跳过过多行
  const pageSize = Math.min(rawPageSize, 100);

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (targetType) where.targetType = targetType;
  if (adminId) where.adminId = adminId;
  if (outcome) where.outcome = outcome;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
    if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        admin: {
          select: { id: true, email: true, name: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: items.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/** 审计日志保留天数（默认 365 天；最小 30，最大 3650，防止误配把审计清空/永久堆积） */
export function getAuditLogRetentionDays(): number {
  const raw = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 1825);
  if (!Number.isFinite(raw)) return 1825;
  return Math.min(Math.max(Math.floor(raw), 30), 3650);
}

/**
 * 清理超过保留期的 AuditLog 记录（合规留存到期后物理删除）。
 * 失败时抛出，由 cron 运行记录（CronTaskRun）标记失败，避免"假成功"。
 */
export async function cleanupOldAuditLogs(): Promise<number> {
  const retentionDays = getAuditLogRetentionDays();
  if (!isAuditArchiveReady()) {
    apiConsole.warn(
      `[CleanupAuditLogs] 审计归档存储未就绪，跳过 ${retentionDays} 天前审计日志的物理删除（fail-closed）`
    );
    return 0;
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      legalHold: false,
    },
  });
  apiConsole.info(`[CleanupAuditLogs] 清理了 ${result.count} 条超过 ${retentionDays} 天的审计日志`);
  return result.count;
}

/**
 * 审计日志服务
 * 记录管理端关键操作，便于追溯和合规审计
 */
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { getClientIP } from "./client-ip";
import { Prisma } from "@/generated/prisma/client";
import type { AuditActorType, AuditOutcome } from "@/generated/prisma/client";
import { apiConsole } from "@/lib/logger";
import { getAuditActionMeta, type AuditCategory, type AuditRiskLevel } from "./audit-registry";
import { AUDIT_CHAIN_VERSION, getAuditIntegrityKeyVersion, prepareAuditChain } from "./audit-chain";

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
  | "sync_products_to_advisor"
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
  | "message_sensitive_view"
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
  | "advisor_user_view"
  | "advisor_user_update"
  | "advisor_report_view"
  | "application_detail_view"
  | "resume_download"
  | "step_up_granted"
  | "user_birthday_update"
  | "user_password_reset"
  | "user_identity_unbind"
  | "user_points_adjust"
  | "points_internal_sync"
  | "points_internal_grant"
  | "points_internal_redeem"
  | "points_internal_refund"
  | "point_redemption_auto_cancel"
  | "point_invariant_check"
  | "update_vip_benefit"
  | "reset_vip_benefit"
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
  | "admin_totp_backup_regenerate"
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
  | "admin_sso_status_sync"
  | "admin_sso_denied"
  | "break_glass_view"
  | "admin_login_failed"
  | "admin_totp_failed"
  | "amap_config_view"
  | "spent_receipt_view"
  | "spent_proof_public_purge"
  | "spent_import_preview"
  | "point_redemption_pii_view"
  | "application_list_view"
  | "audit_log_view"
  | "audit_log_detail_view"
  | "sso_audit_view"
  | "step_up_failed"
  | "audit_integrity_verify"
  | "audit_retention_request"
  | "audit_retention_execute"
  | "audit_legal_hold_create"
  | "audit_legal_hold_release"
  | "admin_approval_requested"
  | "admin_approval_approved"
  | "admin_approval_rejected"
  | "admin_approval_cancelled"
  | "admin_approval_expired"
  | "admin_approval_retried"
  | "admin_approval_executed"
  | "admin_approval_execution_failed"
  | "admin_approval_stale";

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
  | "spent_sync"
  | "point_ledger"
  | "point_gift"
  | "point_redemption"
  | "oauth_session"
  | "point_campaign"
  | "audit_hold"
  | "audit_retention";

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
  "sync_products_to_advisor",
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
  "message_sensitive_view",
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
  "advisor_user_view",
  "advisor_user_update",
  "advisor_report_view",
  "application_detail_view",
  "resume_download",
  "step_up_granted",
  "user_birthday_update",
  "user_password_reset",
  "user_identity_unbind",
  "user_points_adjust",
  "points_internal_sync",
  "points_internal_grant",
  "points_internal_redeem",
  "points_internal_refund",
  "point_redemption_auto_cancel",
  "point_invariant_check",
  "update_vip_benefit",
  "reset_vip_benefit",
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
  "admin_totp_backup_regenerate",
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
  "admin_sso_status_sync",
  "admin_sso_denied",
  "break_glass_view",
  "device_force_logout",
  "admin_login_failed",
  "admin_totp_failed",
  "amap_config_view",
  "spent_receipt_view",
  "spent_proof_public_purge",
  "spent_import_preview",
  "point_redemption_pii_view",
  "application_list_view",
  "audit_log_view",
  "audit_log_detail_view",
  "sso_audit_view",
  "step_up_failed",
  "audit_integrity_verify",
  "audit_retention_request",
  "audit_retention_execute",
  "audit_legal_hold_create",
  "audit_legal_hold_release",
  "admin_approval_requested",
  "admin_approval_approved",
  "admin_approval_rejected",
  "admin_approval_cancelled",
  "admin_approval_expired",
  "admin_approval_retried",
  "admin_approval_executed",
  "admin_approval_execution_failed",
  "admin_approval_stale",
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
  "spent_sync",
  "point_ledger",
  "point_gift",
  "point_redemption",
  "point_campaign",
  "audit_hold",
  "audit_retention",
] as const;

export type AuditSource = "WEB" | "CRON" | "INTEGRATION" | "SYSTEM";

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
  sessionJti?: string | null;
  legalHold?: boolean;
  adminId?: string;
  userId?: string;
  request?: Request;
  category?: AuditCategory;
  riskLevel?: AuditRiskLevel;
  source?: AuditSource;
  reason?: string;
  schemaVersion?: number;
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

export function resolveAuditRequestId(request?: Request): string | undefined {
  if (!request) return undefined;
  // Cloudflare 的 CF-Ray 可与边缘/WAF 日志关联，优先使用。
  const headerId =
    request.headers.get("cf-ray") ||
    request.headers.get("x-request-id") ||
    request.headers.get("x-correlation-id");
  if (headerId) return headerId.slice(0, 128);

  const cached = requestIdCache.get(request);
  if (cached) return cached;
  const generated = randomUUID();
  requestIdCache.set(request, generated);
  return generated;
}

function resolveAuditSource(input: AuditLogInput): AuditSource {
  if (input.source) return input.source;
  if (input.actorType === "SYSTEM") return "CRON";
  if (input.actorType === "INTEGRATION") return "INTEGRATION";
  return "WEB";
}

type AuditEnvelopeData = Omit<
  Prisma.AuditLogUncheckedCreateInput,
  "chainSeq" | "prevHash" | "entryHash"
>;

function buildAuditEnvelope(input: AuditLogInput): AuditEnvelopeData {
  const meta = getAuditActionMeta(input.action);
  const actorType = input.actorType ?? (input.userId ? "USER" : input.adminId ? "ADMIN" : "SYSTEM");
  return {
    id: randomUUID(),
    createdAt: new Date(),
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    detail: prepareDetail(input.detail),
    outcome: input.outcome ?? "SUCCESS",
    requestId: input.requestId ?? resolveAuditRequestId(input.request),
    actorType,
    actorEmail: input.actorEmail,
    actorName: input.actorName,
    actorRole: input.actorRole,
    authMethod: input.authMethod,
    sessionJti: input.sessionJti ?? null,
    legalHold: input.legalHold ?? false,
    ipAddress: input.request ? getClientIP(input.request) : null,
    userAgent: sanitizeUserAgent(input.request?.headers.get("user-agent") ?? null),
    adminId: input.adminId,
    userId: input.userId,
    category: input.category ?? meta.category,
    riskLevel: input.riskLevel ?? meta.riskLevel,
    source: resolveAuditSource({ ...input, actorType }),
    reason: input.reason ?? null,
    schemaVersion: input.schemaVersion ?? 2,
    chainVersion: AUDIT_CHAIN_VERSION,
    integrityKeyVersion: getAuditIntegrityKeyVersion(),
  };
}

async function createWithChain(
  tx: Prisma.TransactionClient,
  input: AuditLogInput
): Promise<{ id: string }> {
  const data = buildAuditEnvelope(input);
  const chain = await prepareAuditChain(tx, {
    id: String(data.id),
    createdAt: data.createdAt as Date,
    action: String(data.action),
    targetType: String(data.targetType),
    targetLabel: data.targetLabel ?? null,
    requestId: data.requestId ?? null,
    actorType: String(data.actorType),
    actorEmail: data.actorEmail ?? null,
    actorName: data.actorName ?? null,
    actorRole: data.actorRole ?? null,
    authMethod: data.authMethod ?? null,
    sessionJti: data.sessionJti ?? null,
    adminId: data.adminId ?? null,
    userId: data.userId ?? null,
    category: data.category ?? null,
    riskLevel: data.riskLevel ?? null,
    source: data.source ?? null,
    schemaVersion: data.schemaVersion ?? 2,
    chainVersion: data.chainVersion ?? AUDIT_CHAIN_VERSION,
    integrityKeyVersion: data.integrityKeyVersion ?? 1,
  });
  return tx.auditLog.create({
    data: { ...data, ...chain },
    select: { id: true },
  });
}

/** 事务内写入审计；失败会向上抛出并回滚业务事务。 */
export async function createAuditLogTx(
  tx: Prisma.TransactionClient,
  input: AuditLogInput
): Promise<string> {
  const log = await createWithChain(tx, input);
  return log.id;
}

/**
 * 在业务变更前写一条 PENDING 审计。
 * 返回 null 表示无法建立审计意图，调用方必须拒绝执行敏感操作。
 */
export async function beginAuditLog(input: AuditLogInput): Promise<string | null> {
  try {
    const log = await prisma.$transaction((tx) =>
      createWithChain(tx, { ...input, outcome: "PENDING" })
    );
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
        finalizedAt: new Date(),
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
 * 写入审计日志（best-effort）
 * @returns 是否写入成功
 */
export async function createAuditLog(input: AuditLogInput): Promise<boolean> {
  try {
    // 在测试环境或 prisma 未完整初始化时，auditLog 可能不可用
    if (!prisma.auditLog) {
      return false;
    }

    await prisma.$transaction((tx) => createWithChain(tx, input));
    return true;
  } catch (error) {
    // 审计日志写入失败不应静默忽略，至少记录到 console 并返回失败
    apiConsole.error("[AuditLog] 写入失败:", error);
    return false;
  }
}

/** 关键操作使用：审计写入失败时抛错，由调用方回滚/拒绝返回成功。 */
export async function createAuditLogStrict(input: AuditLogInput): Promise<void> {
  await prisma.$transaction((tx) => createWithChain(tx, input));
}

export interface AuditLogQueryOptions {
  page?: number;
  pageSize?: number;
  cursor?: string | null;
  action?: string;
  targetType?: string;
  adminId?: string;
  userId?: string;
  actorType?: AuditActorType;
  outcome?: string;
  riskLevel?: string;
  category?: string;
  source?: string;
  authMethod?: string;
  sessionJti?: string;
  targetId?: string;
  requestId?: string;
  ipAddress?: string;
  legalHold?: boolean;
  search?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface AuditCursor {
  createdAt: Date;
  id: string;
}

export function encodeAuditCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    "base64url"
  );
}

export function decodeAuditCursor(cursor?: string | null): AuditCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: string;
      id?: string;
    };
    if (!parsed.createdAt || !parsed.id) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function buildAuditWhere(options: AuditLogQueryOptions): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (options.action) where.action = options.action;
  if (options.targetType) where.targetType = options.targetType;
  if (options.adminId) where.adminId = options.adminId;
  if (options.userId) where.userId = options.userId;
  if (options.actorType) where.actorType = options.actorType;
  if (options.outcome) where.outcome = options.outcome as AuditOutcome;
  if (options.riskLevel) where.riskLevel = options.riskLevel;
  if (options.category) where.category = options.category;
  if (options.source) where.source = options.source;
  if (options.authMethod) where.authMethod = options.authMethod;
  if (options.sessionJti) where.sessionJti = options.sessionJti;
  if (options.targetId) where.targetId = options.targetId;
  if (options.requestId) where.requestId = options.requestId;
  if (options.ipAddress) where.ipAddress = options.ipAddress;
  if (options.legalHold !== undefined) where.legalHold = options.legalHold;
  if (options.startDate || options.endDate) {
    where.createdAt = {};
    if (options.startDate) where.createdAt.gte = options.startDate;
    if (options.endDate) where.createdAt.lte = options.endDate;
  }

  const and: Prisma.AuditLogWhereInput[] = [];
  if (options.search) {
    const search = options.search.slice(0, 100);
    and.push({
      OR: [
        { targetLabel: { contains: search, mode: "insensitive" } },
        { targetId: { contains: search, mode: "insensitive" } },
        { actorName: { contains: search, mode: "insensitive" } },
        { actorEmail: { contains: search, mode: "insensitive" } },
        { requestId: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;
  return where;
}

/**
 * 批量查询审计日志。支持 page 与 keyset cursor 两种模式。
 * cursor 模式不执行 count，避免深分页和导出时的重复全量统计。
 */
export async function listAuditLogs(options: AuditLogQueryOptions) {
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const baseWhere = buildAuditWhere(options);
  const cursor = decodeAuditCursor(options.cursor);
  if (options.cursor && !cursor) throw new Error("INVALID_CURSOR");

  let where: Prisma.AuditLogWhereInput = baseWhere;
  if (cursor) {
    const cursorWhere: Prisma.AuditLogWhereInput = {
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ],
    };
    where = { AND: [baseWhere, cursorWhere] };
  }

  const page = Math.min(Math.max(options.page ?? 1, 1), 1000);
  const include = {
    admin: { select: { id: true, email: true, name: true } },
  } as const;

  const items = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    ...(cursor ? {} : { skip: (page - 1) * pageSize }),
    take: pageSize,
    include,
  });

  const total = cursor ? null : await prisma.auditLog.count({ where: baseWhere });
  const last = items.at(-1);
  const nextCursor = last ? encodeAuditCursor(last.createdAt, last.id) : null;

  return {
    items: items.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
      finalizedAt: log.finalizedAt?.toISOString() ?? null,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === null ? null : Math.ceil(total / pageSize),
      nextCursor,
    },
  };
}

export async function getAuditLogById(id: string) {
  const log = await prisma.auditLog.findUnique({
    where: { id },
    include: {
      admin: { select: { id: true, email: true, name: true } },
    },
  });
  if (!log) return null;
  return {
    ...log,
    createdAt: log.createdAt.toISOString(),
    finalizedAt: log.finalizedAt?.toISOString() ?? null,
  };
}

/**
 * 回收长时间停留在 PENDING 的审计记录（进程崩溃/请求中断）。
 * 触发器只允许 PENDING -> 终态，正好匹配此操作。
 */
export async function reapStalePendingAuditLogs(olderThanMinutes = 10): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const result = await prisma.auditLog.updateMany({
    where: { outcome: "PENDING", createdAt: { lt: cutoff } },
    data: { outcome: "FAILURE", finalizedAt: new Date() },
  });
  if (result.count > 0) {
    apiConsole.warn(`[AuditLog] 回收超时 PENDING 审计记录 ${result.count} 条`);
  }
  return result.count;
}

/** 审计日志保留天数（默认 5 年；最小 30，最大 3650）。 */
export function getAuditLogRetentionDays(): number {
  const raw = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 1825);
  if (!Number.isFinite(raw)) return 1825;
  return Math.min(Math.max(Math.floor(raw), 30), 3650);
}

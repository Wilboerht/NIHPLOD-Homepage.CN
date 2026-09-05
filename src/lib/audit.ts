/**
 * 审计日志服务
 * 记录管理端关键操作，便于追溯和合规审计
 */
import { prisma } from "./prisma";
import { getClientIP } from "./ratelimit";
import { Prisma } from "@/generated/prisma/client";
import { apiConsole } from "@/lib/logger";

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
  | "user_status_change"
  | "user_deleted"
  | "user_detail_view"
  | "user_detail_sensitive_view"
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
  | "user_set_password"
  | "admin_login"
  | "admin_logout"
  | "refresh_token_reuse_detected";

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
  "user_set_password",
  "admin_login",
  "admin_logout",
  "refresh_token_reuse_detected",
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

interface AuditLogInput {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  detail?: Record<string, unknown>;
  adminId?: string;
  userId?: string;
  request?: Request;
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

    await prisma.auditLog.create({
      data: {
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        detail: input.detail ? (input.detail as Prisma.InputJsonValue) : undefined,
        adminId: input.adminId,
        userId: input.userId,
        ipAddress: input.request ? getClientIP(input.request) : null,
        userAgent: sanitizeUserAgent(input.request?.headers.get("user-agent") ?? null),
      },
    });
    return true;
  } catch (error) {
    // 审计日志写入失败不应静默忽略，至少记录到 console 并返回失败
    apiConsole.error("[AuditLog] 写入失败:", error);
    return false;
  }
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
  startDate?: Date;
  endDate?: Date;
}) {
  const {
    page: rawPage,
    pageSize: rawPageSize,
    action,
    targetType,
    adminId,
    startDate,
    endDate,
  } = options;
  const page = Math.min(rawPage, 1000); // 防止跳过过多行
  const pageSize = Math.min(rawPageSize, 100);

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (targetType) where.targetType = targetType;
  if (adminId) where.adminId = adminId;
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

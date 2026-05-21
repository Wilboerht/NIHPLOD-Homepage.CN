/**
 * 审计日志服务
 * 记录管理端关键操作，便于追溯和合规审计
 */
import { prisma } from "./prisma";
import { getClientIP } from "./ratelimit";
import { Prisma } from "@/generated/prisma/client";
import { apiConsole } from "@/lib/logger";

export type AuditAction =
  | "login"
  | "logout"
  | "ship_order"
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
  | "update_message"
  | "delete_message"
  | "batch_message"
  | "create_coupon"
  | "update_coupon"
  | "delete_coupon"
  | "run_cron_task";

export type AuditTargetType =
  | "order"
  | "admin"
  | "product"
  | "category"
  | "job"
  | "message"
  | "application"
  | "coupon"
  | "system";

interface AuditLogInput {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  detail?: Record<string, unknown>;
  adminId: string;
  request?: Request;
}

/**
 * 写入审计日志
 * @returns 是否写入成功
 */
export async function createAuditLog(input: AuditLogInput): Promise<boolean> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        detail: input.detail ? (input.detail as Prisma.InputJsonValue) : undefined,
        adminId: input.adminId,
        ipAddress: input.request ? getClientIP(input.request) : null,
        userAgent: input.request?.headers.get("user-agent") ?? null,
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
  const { page, pageSize, action, targetType, adminId, startDate, endDate } = options;

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

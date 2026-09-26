/**
 * 审计日志查询 API
 * GET /api/admin/audit-logs
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { listAuditLogs, AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";
import {
  AUDIT_ACTION_LABELS as ACTION_LABELS,
  AUDIT_TARGET_TYPE_LABELS as TARGET_TYPE_LABELS,
} from "@/lib/audit-labels";
import { maskAuditDetail } from "@/lib/audit-sanitize";
import { escapeCSV } from "@/lib/sso-audit";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

/** 将 UTC 零点日期转换为 UTC+8 当天 23:59:59.999（含当天全部日志） */
function toUtc8DayEnd(date: Date): Date {
  const nextDayStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, -8, 0, 0, 0)
  );
  return new Date(nextDayStart.getTime() - 1);
}

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1).max(1000)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
  adminId: z.string().cuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "audit:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计日志查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      action: searchParams.get("action") || undefined,
      targetType: searchParams.get("targetType") || undefined,
      adminId: searchParams.get("adminId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    // 审计详情脱敏：无 users:sensitive:read 时递归遮盖手机号/地址/外部身份标识
    type AuditLogRow = Awaited<ReturnType<typeof listAuditLogs>>["items"][number];
    const canViewSensitive = hasAdminPermission(admin, "users:sensitive:read");
    const sanitizeLog = (log: AuditLogRow): AuditLogRow =>
      canViewSensitive ? log : { ...log, detail: maskAuditDetail(log.detail) as AuditLogRow["detail"] };

    const startDate = params.startDate ?? undefined;
    // 结束日期按 UTC+8 当天 23:59:59.999 处理，避免默认 00:00 少算一整天
    const endDate = params.endDate ? toUtc8DayEnd(params.endDate) : undefined;

    // CSV 导出 — 分批拉取（每批 100 条），最多 5 万条并在截断时明确标注
    const isExport = searchParams.get("export") === "csv";
    if (isExport) {
      const EXPORT_BATCH = 100;
      const EXPORT_MAX = 50000;
      const exportItems: AuditLogRow[] = [];
      let truncated = false;
      for (let exportPage = 1; exportItems.length < EXPORT_MAX; exportPage += 1) {
        const batch = await listAuditLogs({
          page: exportPage,
          pageSize: EXPORT_BATCH,
          action: params.action,
          targetType: params.targetType,
          adminId: params.adminId,
          startDate,
          endDate,
        });
        exportItems.push(...batch.items.map((log) => sanitizeLog(log)));
        if (
          batch.items.length < EXPORT_BATCH ||
          exportItems.length >= batch.pagination.total
        ) {
          break;
        }
        if (exportItems.length >= EXPORT_MAX) {
          truncated = exportItems.length < batch.pagination.total;
          break;
        }
      }

      const headers = ["时间", "操作人", "操作", "目标类型", "目标ID", "IP地址", "详情"];
      const rows: string[][] = exportItems.map((log) => [
        new Date(log.createdAt as string).toISOString(),
        log.admin
          ? `${(log.admin as { name: string }).name} (${(log.admin as { email: string }).email})`
          : "-",
        ACTION_LABELS[log.action as string] || (log.action as string),
        TARGET_TYPE_LABELS[log.targetType as string] || (log.targetType as string),
        (log.targetId as string) || "-",
        (log.ipAddress as string) || "-",
        JSON.stringify(log.detail || {}),
      ]);
      if (truncated) {
        rows.push([
          `导出已截断：仅包含前 ${EXPORT_MAX} 条，请缩小时间范围后重试`,
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
      }
      const csv = [headers.join(","), ...rows.map((r) => r.map(escapeCSV).join(","))].join("\n");
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=audit-logs.csv",
        },
      });
    }

    const result = await listAuditLogs({
      page: params.page,
      pageSize: params.pageSize,
      action: params.action,
      targetType: params.targetType,
      adminId: params.adminId,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        items: result.items.map((log) => sanitizeLog(log)),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    apiConsole.error("[AuditLogs] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500 }
    );
  }
}

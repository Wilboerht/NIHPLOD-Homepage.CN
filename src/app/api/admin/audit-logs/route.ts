/**
 * 审计日志查询 API
 * GET /api/admin/audit-logs
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import {
  listAuditLogs,
  createAuditLog,
  createAuditLogStrict,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
} from "@/lib/audit";
import {
  AUDIT_ACTION_LABELS as ACTION_LABELS,
  AUDIT_TARGET_TYPE_LABELS as TARGET_TYPE_LABELS,
} from "@/lib/audit-labels";
import {
  maskAuditDetail,
  maskAuditText,
  redactSensitiveAuditDetail,
} from "@/lib/audit-sanitize";
import { maskIdentifier, maskIp } from "@/lib/mask-phone";
import { escapeCSV } from "@/lib/sso-audit";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { parseUtc8DateBoundary } from "@/lib/timezone";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1).max(1000)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
  adminId: z.string().cuid().optional(),
  outcome: z.enum(["PENDING", "SUCCESS", "FAILURE", "PARTIAL"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

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
      outcome: searchParams.get("outcome") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    // 审计详情脱敏：无 audit:sensitive:read 时遮盖 PII、IP、UA 与操作者邮箱
    type AuditLogRow = Awaited<ReturnType<typeof listAuditLogs>>["items"][number];
    const canViewSensitive = hasAdminPermission(admin, "audit:sensitive:read");
    // 高敏自由文本（留言/备注/简历）对所有人隐藏；敏感权限只影响 PII/IP/UA。
    const scrubLog = (log: AuditLogRow): AuditLogRow => ({
      ...log,
      detail: redactSensitiveAuditDetail(log.detail) as AuditLogRow["detail"],
    });
    const sanitizeLog = (log: AuditLogRow): AuditLogRow => {
      const scrubbed = scrubLog(log);
      if (canViewSensitive) return scrubbed;
      return {
        ...scrubbed,
        targetLabel: scrubbed.targetLabel ? maskAuditText(scrubbed.targetLabel) : null,
        detail: maskAuditDetail(scrubbed.detail) as AuditLogRow["detail"],
        ipAddress: scrubbed.ipAddress ? maskIp(scrubbed.ipAddress) : null,
        userAgent: null,
        actorEmail: scrubbed.actorEmail ? maskIdentifier(scrubbed.actorEmail) : null,
        admin: scrubbed.admin
          ? { ...scrubbed.admin, email: maskIdentifier(scrubbed.admin.email) ?? "-" }
          : null,
      };
    };

    // 仅日期字符串按 UTC+8 当天 00:00 / 23:59:59.999 解析；
    // 不能直接 z.coerce.date()，否则 YYYY-MM-DD 会被当成 UTC 00:00（=北京时间 08:00）。
    const startDate = params.startDate
      ? (parseUtc8DateBoundary(params.startDate, false) ?? undefined)
      : undefined;
    const endDate = params.endDate
      ? (parseUtc8DateBoundary(params.endDate, true) ?? undefined)
      : undefined;

    if ((params.startDate && !startDate) || (params.endDate && !endDate)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_DATE", message: "日期格式错误" } },
        { status: 400 }
      );
    }

    // CSV 导出 — 分批拉取（每批 100 条），最多 5 万条并在截断时明确标注
    const isExport = searchParams.get("export") === "csv";
    if (isExport && !hasAdminPermission(admin, "audit:export")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计日志导出" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }
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
          outcome: params.outcome,
          startDate,
          endDate,
        });
        exportItems.push(...batch.items.map((log) => sanitizeLog(log)));
        if (batch.items.length < EXPORT_BATCH || exportItems.length >= batch.pagination.total) {
          break;
        }
        if (exportItems.length >= EXPORT_MAX) {
          truncated = exportItems.length < batch.pagination.total;
          break;
        }
      }

      const headers = ["时间", "操作人", "操作", "结果", "目标类型", "目标ID", "IP地址", "详情"];
      const rows: string[][] = exportItems.map((log) => [
        new Date(log.createdAt as string).toISOString(),
        log.admin
          ? `${(log.admin as { name: string }).name} (${(log.admin as { email: string }).email})`
          : "-",
        ACTION_LABELS[log.action as string] || (log.action as string),
        (log as { outcome?: string }).outcome || "SUCCESS",
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
          "",
        ]);
      }
      const csv = [headers.join(","), ...rows.map((r) => r.map(escapeCSV).join(","))].join("\n");

      // 导出审计：记录筛选条件与导出条数（审计不可用时拒绝导出）
      await createAuditLogStrict({
        action: "audit_log_export",
        targetType: "system",
        detail: {
          action: params.action ?? null,
          targetType: params.targetType ?? null,
          adminId: params.adminId ?? null,
          outcome: params.outcome ?? null,
          startDate: startDate?.toISOString() ?? null,
          endDate: endDate?.toISOString() ?? null,
          exportedCount: exportItems.length,
          truncated,
        },
        actorType: "ADMIN",
        actorEmail: admin.email,
        actorName: admin.name,
        actorRole: admin.role,
        authMethod: "session",
        adminId: admin.id,
        request,
      });

      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=audit-logs.csv",
          ...NO_STORE_HEADERS,
        },
      });
    }

    const result = await listAuditLogs({
      page: params.page,
      pageSize: params.pageSize,
      action: params.action,
      targetType: params.targetType,
      adminId: params.adminId,
      outcome: params.outcome,
      startDate,
      endDate,
    });

    // 审计日志查看也留痕；同一管理员 5 分钟内合并为一条，避免翻页刷屏。
    const recentView = await prisma.auditLog.findFirst({
      where: {
        action: "audit_log_view",
        adminId: admin.id,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (!recentView) {
      await createAuditLog({
        action: "audit_log_view",
        targetType: "system",
        actorType: "ADMIN",
        actorEmail: admin.email,
        actorName: admin.name,
        actorRole: admin.role,
        authMethod: "session",
        detail: {
          filters: {
            action: params.action ?? null,
            targetType: params.targetType ?? null,
            adminId: params.adminId ?? null,
            outcome: params.outcome ?? null,
            startDate: params.startDate ?? null,
            endDate: params.endDate ?? null,
          },
          page: params.page,
          pageSize: params.pageSize,
          count: result.items.length,
        },
        adminId: admin.id,
        request,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...result,
          items: result.items.map((log) => sanitizeLog(log)),
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues },
        },
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

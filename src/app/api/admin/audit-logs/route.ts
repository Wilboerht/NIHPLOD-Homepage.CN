/**
 * 审计日志查询 API
 * GET /api/admin/audit-logs
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import {
  listAuditLogs,
  createAuditLog,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
} from "@/lib/audit";
import { AUDIT_RISK_LEVELS, AUDIT_CATEGORIES } from "@/lib/audit-registry";
import { maskAuditText } from "@/lib/audit-sanitize";
import { maskIdentifier, maskIp } from "@/lib/mask-phone";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { parseUtc8DateBoundary } from "@/lib/timezone";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1).max(1000)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  cursor: z.string().max(500).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
  adminId: z.string().cuid().optional(),
  userId: z.string().max(64).optional(),
  actorType: z.enum(["ADMIN", "USER", "SYSTEM", "INTEGRATION", "ALL"]).default("ADMIN"),
  outcome: z.enum(["PENDING", "SUCCESS", "FAILURE", "PARTIAL"]).optional(),
  riskLevel: z.enum(AUDIT_RISK_LEVELS).optional(),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  source: z.enum(["WEB", "CRON", "INTEGRATION", "SYSTEM"]).optional(),
  authMethod: z.string().max(64).optional(),
  sessionJti: z.string().max(128).optional(),
  targetId: z.string().max(128).optional(),
  requestId: z.string().max(128).optional(),
  ipAddress: z.string().max(64).optional(),
  legalHold: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional()
  ),
  search: z.string().max(100).optional(),
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
      cursor: searchParams.get("cursor") || undefined,
      action: searchParams.get("action") || undefined,
      targetType: searchParams.get("targetType") || undefined,
      adminId: searchParams.get("adminId") || undefined,
      userId: searchParams.get("userId") || undefined,
      actorType: searchParams.get("actorType") || undefined,
      outcome: searchParams.get("outcome") || undefined,
      riskLevel: searchParams.get("riskLevel") || undefined,
      category: searchParams.get("category") || undefined,
      source: searchParams.get("source") || undefined,
      authMethod: searchParams.get("authMethod") || undefined,
      sessionJti: searchParams.get("sessionJti") || undefined,
      targetId: searchParams.get("targetId") || undefined,
      requestId: searchParams.get("requestId") || undefined,
      ipAddress: searchParams.get("ipAddress") || undefined,
      legalHold: searchParams.get("legalHold") || undefined,
      search: searchParams.get("search") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });
    const actorType = params.actorType === "ALL" ? undefined : params.actorType;

    const canViewSensitive = hasAdminPermission(admin, "audit:sensitive:read");
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

    const result = await listAuditLogs({
      page: params.page,
      pageSize: params.pageSize,
      cursor: params.cursor,
      action: params.action,
      targetType: params.targetType,
      adminId: params.adminId,
      userId: params.userId,
      actorType,
      outcome: params.outcome,
      riskLevel: params.riskLevel,
      category: params.category,
      source: params.source,
      authMethod: params.authMethod,
      sessionJti: params.sessionJti,
      targetId: params.targetId,
      requestId: params.requestId,
      ipAddress: params.ipAddress,
      legalHold: params.legalHold,
      search: params.search,
      startDate,
      endDate,
    });

    // 列表不返回完整 detail；详情由 /api/admin/audit-logs/[id] 提供并单独留痕。
    type AuditLogRow = (typeof result.items)[number];
    const sanitize = (log: AuditLogRow) => {
      const { detail, ...rest } = log;
      void detail;
      return {
        ...rest,
        targetLabel: canViewSensitive
          ? rest.targetLabel
          : rest.targetLabel
            ? maskAuditText(rest.targetLabel)
            : null,
        actorEmail: canViewSensitive
          ? rest.actorEmail
          : rest.actorEmail
            ? maskIdentifier(rest.actorEmail)
            : null,
        ipAddress: canViewSensitive
          ? rest.ipAddress
          : rest.ipAddress
            ? maskIp(rest.ipAddress)
            : null,
        userAgent: canViewSensitive ? rest.userAgent : null,
        admin: rest.admin
          ? {
              ...rest.admin,
              email: canViewSensitive
                ? rest.admin.email
                : (maskIdentifier(rest.admin.email) ?? "-"),
            }
          : null,
      };
    };

    // 查看审计日志本身也留痕；同一管理员 5 分钟内合并。
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
        sessionJti: admin.jti ?? null,
        source: "WEB",
        detail: {
          filters: {
            action: params.action ?? null,
            targetType: params.targetType ?? null,
            adminId: params.adminId ?? null,
            userId: params.userId ?? null,
            actorType: params.actorType,
            outcome: params.outcome ?? null,
            riskLevel: params.riskLevel ?? null,
            category: params.category ?? null,
            search: params.search ?? null,
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
          items: result.items.map(sanitize),
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
    if (error instanceof Error && error.message === "INVALID_CURSOR") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CURSOR", message: "分页游标无效" } },
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

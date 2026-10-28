/**
 * 审计导出任务
 * POST /api/admin/audit-logs/exports 创建任务
 * GET  /api/admin/audit-logs/exports 任务列表
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { createAuditExportJob } from "@/lib/audit-export";
import { apiConsole } from "@/lib/logger";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export const dynamic = "force-dynamic";

const createSchema = z.object({
  stream: z.enum(["audit", "sso"]).default("audit"),
  format: z.enum(["csv", "jsonl"]).default("csv"),
  reason: z.string().max(500).optional(),
  filters: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "audit:read") || !hasAdminPermission(admin, "audit:export")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计日志查看或导出" } },
        { status: 403 }
      );
    }
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const jobs = await prisma.auditExportJob.findMany({
      where: admin.role === "owner" ? {} : { adminId: admin.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json(
      {
        success: true,
        data: {
          items: jobs.map((job) => ({
            ...job,
            createdAt: job.createdAt.toISOString(),
            startedAt: job.startedAt?.toISOString() ?? null,
            finishedAt: job.finishedAt?.toISOString() ?? null,
            expiresAt: job.expiresAt?.toISOString() ?? null,
          })),
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    apiConsole.error("[AuditExport] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "audit:read") || !hasAdminPermission(admin, "audit:export")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计日志查看或导出" } },
        { status: 403 }
      );
    }
    if (!validateCSRFToken(request)) return csrfForbiddenResponse();
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-write");
    if (rateLimitResponse) return rateLimitResponse;
    const stepUp = await requireAdminStepUp(request, admin);
    if (stepUp) return stepUp;

    const body = createSchema.parse(await request.json());
    if (body.stream === "sso" && !hasAdminPermission(admin, "sso:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：SSO 审计查看" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }
    const filters = {
      ...body.filters,
      canViewSensitive: hasAdminPermission(admin, "audit:sensitive:read"),
    };
    const job = await createAuditExportJob({
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.name,
      stream: body.stream,
      format: body.format,
      filters,
    });

    await createAuditLog({
      action: "audit_log_export",
      targetType: "system",
      targetId: job.id,
      outcome: "SUCCESS",
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "step_up",
      sessionJti: admin.jti ?? null,
      source: "WEB",
      reason: body.reason ?? "导出审计日志",
      detail: {
        phase: "requested",
        jobId: job.id,
        stream: body.stream,
        format: body.format,
        filters,
      },
      adminId: admin.id,
      request,
    });

    return NextResponse.json(
      { success: true, data: { id: job.id, status: job.status } },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    apiConsole.error("[AuditExport] POST 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "创建导出任务失败" } },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  try {
    const { id } = await params;
    const job = await prisma.auditExportJob.findUnique({ where: { id } });
    if (!job || (job.adminId !== admin.id && admin.role !== "owner")) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "任务不存在" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        success: true,
        data: {
          ...job,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString() ?? null,
          finishedAt: job.finishedAt?.toISOString() ?? null,
          expiresAt: job.expiresAt?.toISOString() ?? null,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    apiConsole.error("[AuditExportJob] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { createAuditLogStrict } from "@/lib/audit";
import { getAuditExportFilePath } from "@/lib/audit-export";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "audit:export")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计导出" } },
        { status: 403 }
      );
    }
    const stepUp = await requireAdminStepUp(request, admin);
    if (stepUp) return stepUp;

    const { id } = await params;
    const job = await prisma.auditExportJob.findUnique({ where: { id } });
    if (!job || (job.adminId !== admin.id && admin.role !== "owner")) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "任务不存在" } },
        { status: 404 }
      );
    }
    if (job.status !== "SUCCEEDED" || !job.filePath) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_READY", message: "导出文件尚未生成" } },
        { status: 409 }
      );
    }
    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: { code: "EXPIRED", message: "导出文件已过期" } },
        { status: 410 }
      );
    }

    const filePath = getAuditExportFilePath(job.filePath);
    const content = await readFile(filePath);

    // 下载本身必须留痕；写入失败则拒绝下载。
    await createAuditLogStrict({
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
      reason: "下载审计导出文件",
      detail: {
        phase: "downloaded",
        jobId: job.id,
        sha256: job.sha256,
        size: content.length,
        format: job.format,
        stream: job.stream,
      },
      adminId: admin.id,
      request,
    });

    const ext = job.format === "jsonl" ? "jsonl" : "csv";
    return new NextResponse(content, {
      headers: {
        "Content-Type":
          ext === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-export-${job.id}.${ext}"`,
        "X-Checksum-Sha256": job.sha256 ?? "",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    apiConsole.error("[AuditExportDownload] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "下载失败" } },
      { status: 500 }
    );
  }
}

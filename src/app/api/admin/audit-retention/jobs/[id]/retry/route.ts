import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLogTx } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { requireFreshAdminTotp } from "@/lib/admin-totp";
import { parseAdminJsonBody } from "@/lib/request-body";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }
  if (admin.role !== "owner" || !hasAdminPermission(admin, "audit:retention:execute")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "仅 owner 可重试" } },
      { status: 403 }
    );
  }
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  const rateLimitResponse = await checkAdminRateLimit(request, "admin-write");
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const parsed = await parseAdminJsonBody<{ totpCode?: string }>(request);
    if (!parsed.ok) return parsed.response;
    const totpFailure = await requireFreshAdminTotp(admin.id, parsed.data.totpCode);
    if (totpFailure) return totpFailure;
    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.auditRetentionJob.findUnique({
        where: { id },
        select: { status: true, expiresAt: true },
      });
      if (!job || job.status !== "FAILED" || job.expiresAt.getTime() <= Date.now()) {
        return null;
      }
      const updated = await tx.auditRetentionJob.updateMany({
        where: { id, status: "FAILED" },
        data: {
          status: "PENDING",
          attempts: 0,
          nextRetryAt: null,
          error: null,
          finishedAt: null,
          leaseToken: null,
          heartbeatAt: null,
        },
      });
      if (updated.count === 0) return null;
      await createAuditLogTx(tx, {
        action: "audit_retention_request",
        targetType: "audit_retention",
        targetId: id,
        targetLabel: id,
        actorType: "ADMIN",
        actorEmail: admin.email,
        actorName: admin.name,
        actorRole: admin.role,
        authMethod: "session",
        sessionJti: admin.jti ?? null,
        source: "WEB",
        reason: "手动重试失败的审计清理任务",
        detail: { phase: "retried", jobId: id },
        adminId: admin.id,
        request,
      });
      return updated;
    });

    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_RETRYABLE", message: "任务不可重试" } },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    apiConsole.error("[AuditRetentionRetry] 重试失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "重试失败" } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

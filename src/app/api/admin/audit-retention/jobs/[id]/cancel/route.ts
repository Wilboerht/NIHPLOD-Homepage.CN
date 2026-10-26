import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLogTx } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

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
      { success: false, error: { code: "FORBIDDEN", message: "仅 owner 可取消" } },
      { status: 403 }
    );
  }
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();

  const { id } = await params;
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.auditRetentionJob.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    if (updated.count > 0) {
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
        reason: "取消审计清理任务",
        detail: { phase: "cancelled", jobId: id },
        adminId: admin.id,
        request,
      });
    }
    return updated;
  });
  if (result.count === 0) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CANCELLABLE", message: "任务不可取消" } },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
}

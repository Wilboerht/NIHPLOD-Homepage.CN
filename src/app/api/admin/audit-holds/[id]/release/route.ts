import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { requireFreshAdminTotp } from "@/lib/admin-totp";
import { createAuditLogTx } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().min(5).max(500),
  totpCode: z.string().min(6).max(16),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }
  if (admin.role !== "owner" || !hasAdminPermission(admin, "audit:hold")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "仅 owner 可解除法律保留" } },
      { status: 403 }
    );
  }
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();

  try {
    const body = schema.parse(await request.json());
    const totp = await requireFreshAdminTotp(admin.id, body.totpCode);
    if (totp) return totp;

    const { id } = await params;
    const hold = await prisma.auditLegalHold.findUnique({ where: { id } });
    if (!hold || !hold.active) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "法律保留不存在或已解除" } },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLegalHold.update({
        where: { id },
        data: { active: false, releasedBy: admin.id, releasedAt: new Date() },
      });

      await createAuditLogTx(tx, {
        action: "audit_legal_hold_release",
        targetType: "audit_hold",
        targetId: hold.id,
        targetLabel: hold.id,
        actorType: "ADMIN",
        actorEmail: admin.email,
        actorName: admin.name,
        actorRole: admin.role,
        authMethod: "totp",
        sessionJti: admin.jti ?? null,
        source: "WEB",
        reason: body.reason,
        detail: {
          holdId: hold.id,
          targetType: hold.targetType,
          targetId: hold.targetId,
          userId: hold.userId,
          adminId: hold.adminId,
        },
        adminId: admin.id,
        request,
      });
    });

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "解除失败" } },
      { status: 500 }
    );
  }
}

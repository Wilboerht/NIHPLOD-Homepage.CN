import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { requireFreshAdminTotp } from "@/lib/admin-totp";
import { createAuditLogTx } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    targetType: z.string().max(64).optional(),
    targetId: z.string().max(128).optional(),
    userId: z.string().max(64).optional(),
    adminId: z.string().max(64).optional(),
    reason: z.string().min(5).max(500),
    totpCode: z.string().min(6).max(16),
    expiresAt: z.string().datetime().optional(),
  })
  .refine(
    (value) => Boolean((value.targetType && value.targetId) || value.userId || value.adminId),
    { message: "至少需要 targetType+targetId、userId 或 adminId 之一" }
  )
  .refine((value) => Boolean(value.targetType) === Boolean(value.targetId), {
    message: "targetType 与 targetId 必须同时提供",
  });

export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }
  if (!hasAdminPermission(admin, "audit:hold")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "仅 owner 可查看法律保留" } },
      { status: 403 }
    );
  }
  const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
  if (rateLimitResponse) return rateLimitResponse;

  const holds = await prisma.auditLegalHold.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(
    {
      success: true,
      data: {
        items: holds.map((hold) => ({
          ...hold,
          createdAt: hold.createdAt.toISOString(),
          releasedAt: hold.releasedAt?.toISOString() ?? null,
          expiresAt: hold.expiresAt?.toISOString() ?? null,
        })),
      },
    },
    { headers: NO_STORE_HEADERS }
  );
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
    if (admin.role !== "owner" || !hasAdminPermission(admin, "audit:hold")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅 owner 可设置法律保留" } },
        { status: 403 }
      );
    }
    if (!validateCSRFToken(request)) return csrfForbiddenResponse();
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = createSchema.parse(await request.json());
    const totp = await requireFreshAdminTotp(admin.id, body.totpCode);
    if (totp) return totp;

    const hold = await prisma.$transaction(async (tx) => {
      const created = await tx.auditLegalHold.create({
        data: {
          targetType: body.targetType ?? null,
          targetId: body.targetId ?? null,
          userId: body.userId ?? null,
          adminId: body.adminId ?? null,
          reason: body.reason,
          createdBy: admin.id,
          createdByEmail: admin.email,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      });
      await createAuditLogTx(tx, {
        action: "audit_legal_hold_create",
        targetType: "audit_hold",
        targetId: created.id,
        targetLabel: created.id,
        actorType: "ADMIN",
        actorEmail: admin.email,
        actorName: admin.name,
        actorRole: admin.role,
        authMethod: "totp",
        sessionJti: admin.jti ?? null,
        source: "WEB",
        reason: body.reason,
        detail: {
          holdId: created.id,
          targetType: created.targetType,
          targetId: created.targetId,
          userId: created.userId,
          adminId: created.adminId,
          expiresAt: created.expiresAt?.toISOString() ?? null,
        },
        adminId: admin.id,
        request,
      });
      return created;
    });

    return NextResponse.json(
      { success: true, data: { id: hold.id } },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    apiConsole.error("[AuditHold] POST 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "创建失败" } },
      { status: 500 }
    );
  }
}

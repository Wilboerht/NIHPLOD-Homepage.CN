/**
 * 创建审计到期清理任务（仅 owner + 新鲜 TOTP）。
 * 实际删除由独立 worker 使用 audit_retention 角色执行。
 * POST /api/admin/audit-retention/execute
 */
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { requireFreshAdminTotp } from "@/lib/admin-totp";
import {
  buildRetentionApprovalSignature,
  buildRetentionPreview,
  defaultRetentionCutoffs,
} from "@/lib/audit-retention";
import { prisma } from "@/lib/prisma";
import { createAuditLogTx } from "@/lib/audit";
import { apiLogger, apiConsole } from "@/lib/logger";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().min(10).max(500),
  confirmation: z.literal("确认删除审计日志"),
  totpCode: z.string().min(6).max(16),
  localOnlyAck: z.literal(true),
  previewHash: z.string().length(64),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (
      admin.role !== "owner" ||
      !hasAdminPermission(admin, "audit:retention:execute")
    ) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅 owner 可执行审计清理" } },
        { status: 403 }
      );
    }
    if (!validateCSRFToken(request)) return csrfForbiddenResponse();
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-write");
    if (rateLimitResponse) return rateLimitResponse;

    if (process.env.AUDIT_RETENTION_ENABLED !== "true") {
      return NextResponse.json(
        { success: false, error: { code: "RETENTION_DISABLED", message: "审计清理未启用" } },
        { status: 503 }
      );
    }
    if (process.env.AUDIT_RETENTION_ALLOW_LOCAL_ONLY !== "true") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "LOCAL_ONLY_NOT_ACKNOWLEDGED",
            message: "未配置 AUDIT_RETENTION_ALLOW_LOCAL_ONLY=true，worker 会拒绝执行",
          },
        },
        { status: 503 }
      );
    }

    const body = schema.parse(await request.json());
    const totp = await requireFreshAdminTotp(admin.id, body.totpCode);
    if (totp) return totp;

    const cutoffs = defaultRetentionCutoffs();
    const preview = await buildRetentionPreview({ cutoffs });
    if (preview.previewHash !== body.previewHash) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PREVIEW_CHANGED",
            message: "预览结果已变化，请刷新预览后重试",
            details: { warnings: preview.warnings },
          },
        },
        { status: 409 }
      );
    }
    if (!preview.ready) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RETENTION_NOT_READY",
            message: "当前不满足删除条件",
            details: { warnings: preview.warnings, expectedCount: preview.expectedCount },
          },
        },
        { status: 409 }
      );
    }

    const id = randomUUID();
    const totpVerifiedAt = new Date();
    const expiresAt = new Date(totpVerifiedAt.getTime() + 15 * 60 * 1000);
    const approvalSignature = buildRetentionApprovalSignature({
      id,
      requestedBy: admin.id,
      requestedByRole: admin.role,
      reason: body.reason,
      cutoffs,
      previewHash: preview.previewHash,
      expectedCount: preview.expectedCount,
      expectedBytes: preview.expectedBytes,
      localOnlyAck: body.localOnlyAck,
      totpVerifiedAt,
    });

    await prisma.$transaction(async (tx) => {
      await tx.auditRetentionJob.create({
        data: {
          id,
          requestedBy: admin.id,
          requestedByEmail: admin.email,
          requestedByRole: admin.role,
          reason: body.reason,
          streams: JSON.parse(JSON.stringify(cutoffs)),
          cutoff: new Date(cutoffs[0].cutoff),
          previewHash: preview.previewHash,
          expectedCount: preview.expectedCount,
          expectedBytes: preview.expectedBytes,
          localOnlyAck: body.localOnlyAck,
          totpVerifiedAt,
          approvalSignature,
          status: "PENDING",
          expiresAt,
        },
      });

      await createAuditLogTx(tx, {
        action: "audit_retention_request",
        targetType: "audit_retention",
        targetId: id,
        targetLabel: id,
        actorType: "ADMIN",
        actorEmail: admin.email,
        actorName: admin.name,
        actorRole: admin.role,
        authMethod: "totp",
        sessionJti: admin.jti ?? null,
        source: "WEB",
        reason: body.reason,
        detail: {
          jobId: id,
          cutoffs,
          expectedCount: preview.expectedCount,
          expectedBytes: preview.expectedBytes,
          holdsExcluded: preview.holdsExcluded,
          localOnlyAck: body.localOnlyAck,
          previewHash: preview.previewHash,
        },
        adminId: admin.id,
        request,
      });
    });

    apiLogger.warn("[AuditRetention] owner 已创建清理任务", {
      jobId: id,
      adminId: admin.id,
      expectedCount: preview.expectedCount,
    });

    return NextResponse.json(
      { success: true, data: { id, status: "PENDING", expiresAt: expiresAt.toISOString() } },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    apiConsole.error("[AuditRetention] execute 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "创建清理任务失败" } },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import {
  ADMIN_TOTP_RECOVERY_TTL_MINUTES,
  createAdminTotpRecovery,
} from "@/lib/admin-totp-recovery";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().trim().min(5, "请填写至少 5 个字符的原因").max(500, "原因过长"),
  totpCode: z.string().trim().max(64).optional(),
});

/**
 * POST /api/admin/admins/[id]/totp-recovery
 * 仅 owner 可为丢失 TOTP 设备的管理员签发一次性恢复码。
 */
export const POST = withAuth<NextRequest, { params: Promise<{ id: string }> }, NextResponse>(
  async (request: NextRequest, admin, context) => {
    try {
      if (!validateCSRFToken(request)) return csrfForbiddenResponse();

      if (admin.role !== "owner") {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "仅超级管理员可签发 TOTP 恢复码" },
          },
          { status: 403 }
        );
      }

      const rateLimitResponse = await checkAdminRateLimit(request, "admin-totp-recovery");
      if (rateLimitResponse) return rateLimitResponse;

      const { id } = await context.params;
      if (!validateCUID(id)) return invalidIdResponse();
      if (id === admin.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "SELF_RECOVERY_FORBIDDEN",
              message: "不能为自己签发恢复码，请使用备用码",
            },
          },
          { status: 400 }
        );
      }

      const parsed = bodySchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_PARAMS",
              message: parsed.error.issues[0]?.message || "参数错误",
            },
          },
          { status: 400 }
        );
      }

      const target = await prisma.admin.findUnique({
        where: { id, deletedAt: null },
        select: {
          id: true,
          email: true,
          status: true,
          totpEnabled: true,
          totpResetRequired: true,
        },
      });
      if (!target) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "管理员不存在" } },
          { status: 404 }
        );
      }
      if (target.status !== "ACTIVE") {
        return NextResponse.json(
          { success: false, error: { code: "ADMIN_INACTIVE", message: "目标管理员不可用" } },
          { status: 400 }
        );
      }
      if (!target.totpEnabled && !target.totpResetRequired) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "TOTP_NOT_ENABLED", message: "目标管理员尚未启用 TOTP，无需签发恢复码" },
          },
          { status: 400 }
        );
      }

      // 恢复码签发属于管理员安全操作：始终要求 step-up，不受资金开关影响
      const totpFailure = await requireAdminStepUp(request, admin);
      if (totpFailure) return totpFailure;

      const auditDetail = {
        targetEmail: target.email,
        reason: parsed.data.reason,
        expiresInMinutes: ADMIN_TOTP_RECOVERY_TTL_MINUTES,
      };
      const auditId = await beginAuditLog({
        action: "admin_totp_recovery_issued",
        targetType: "admin",
        targetId: target.id,
        detail: auditDetail,
        actorType: "ADMIN",
        actorEmail: admin.email,
        actorName: admin.name,
        actorRole: admin.role,
        authMethod: "totp",
        sessionJti: admin.jti,
        adminId: admin.id,
        request,
      });
      if (!auditId) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
          },
          { status: 503 }
        );
      }

      const recovery = await createAdminTotpRecovery({
        adminId: target.id,
        createdBy: admin.id,
        reason: parsed.data.reason,
      }).catch(async (error) => {
        await finishAuditLog(auditId, "FAILURE", auditDetail);
        throw error;
      });

      await finishAuditLog(auditId, "SUCCESS", auditDetail);

      return NextResponse.json(
        {
          success: true,
          data: {
            code: recovery.code,
            expiresAt: recovery.expiresAt.toISOString(),
            expiresInMinutes: ADMIN_TOTP_RECOVERY_TTL_MINUTES,
            targetEmail: target.email,
          },
        },
        { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } }
      );
    } catch (error) {
      apiConsole.error("[AdminTOTPRecovery] 签发失败:", error);
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
        { status: 500 }
      );
    }
  }
);

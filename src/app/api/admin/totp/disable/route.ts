/**
 * 管理员 TOTP 关闭
 * POST /api/admin/totp/disable
 *
 * 需要验证当前密码才能关闭 TOTP。
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { verifyTOTP, decryptTOTPSecret } from "@/lib/totp";
import { consumeAdminBackupCode } from "@/lib/admin-backup-code";
import { consumeAccessTokenOnce } from "@/lib/token-blacklist";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import {
  ADMIN_STEP_UP_COOKIE_NAME,
  ADMIN_STEP_UP_COOKIE_OPTIONS,
  revokeAllAdminStepUpGrants,
} from "@/lib/admin-step-up";

const disableSchema = z.object({
  password: z.string().min(1, "请输入密码"),
  totpCode: z.string().optional(),
});

export const dynamic = "force-dynamic";

export const POST = withAuth(async (request: NextRequest, adminPayload) => {
  try {
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const result = disableSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message },
        },
        { status: 400 }
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { id: adminPayload.id },
      select: {
        id: true,
        password: true,
        totpEnabled: true,
        totpSecret: true,
        totpBackupCodes: true,
      },
    });

    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "管理员不存在" } },
        { status: 404 }
      );
    }

    if (!admin.totpEnabled) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_NOT_ENABLED", message: "二次验证未启用" } },
        { status: 400 }
      );
    }

    const passwordValid = await verifyPassword(result.data.password, admin.password);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: { code: "PASSWORD_INVALID", message: "密码错误" } },
        { status: 401 }
      );
    }

    // 必须验证 TOTP 码或备用码，防止仅有密码（非完整 2FA）即可关闭 2FA
    const totpCode = result.data.totpCode;
    if (!totpCode || totpCode.length < 6) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_REQUIRED", message: "请输入二次验证码以关闭 2FA" } },
        { status: 400 }
      );
    }

    // TOTP 专用速率限制（与登录口 admin-totp 桶同档），防结合密码验证穷举动态码
    const totpLimit = await rateLimit(`admin-totp-disable:${admin.id}`, "admin-totp");
    if (!totpLimit.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOTP_RATE_LIMITED", message: "二次验证尝试过于频繁，请 5 分钟后再试" },
        },
        { status: 429 }
      );
    }

    let totpValid = false;
    if (admin.totpSecret) {
      try {
        const secret = decryptTOTPSecret(admin.totpSecret);
        totpValid = verifyTOTP(totpCode, secret);
        if (totpValid) {
          // 跨实例防重放：与登录/资金操作同口径（原子消费，存储故障 fail-closed）
          const replayKey = `totp:${admin.id}:${totpCode}`;
          if (!(await consumeAccessTokenOnce(replayKey))) {
            apiConsole.warn("[TOTP Disable] 检测到 TOTP 重放或存储不可用:", admin.id);
            totpValid = false;
          }
        }
      } catch {
        totpValid = false;
      }
    }

    if (!totpValid && admin.totpBackupCodes) {
      try {
        const consumed = await consumeAdminBackupCode(admin.id, totpCode, admin.totpBackupCodes);
        if (consumed.ok) {
          totpValid = true;
        } else if (consumed.reason === "conflict") {
          apiConsole.warn("[TOTP Disable] 备用码已被并发消费:", admin.id);
        }
      } catch (err) {
        apiConsole.warn("[TOTP Disable] 备用码消费失败（fail-closed）:", err);
      }
    }

    if (!totpValid) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_INVALID", message: "二次验证码错误" } },
        { status: 401 }
      );
    }

    const auditId = await beginAuditLog({
      action: "update_admin",
      targetType: "admin",
      targetId: admin.id,
      detail: { action: "totp_disabled" },
      actorType: "ADMIN",
      actorEmail: adminPayload.email,
      actorName: adminPayload.name,
      actorRole: adminPayload.role,
      authMethod: "session",
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

    try {
      await prisma.$transaction(async (tx) => {
        await tx.admin.update({
          where: { id: admin.id },
          data: {
            totpEnabled: false,
            totpSecret: null,
            totpBackupCodes: null,
          },
        });
      });
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", { action: "totp_disabled" });
      throw error;
    }

    await revokeAllAdminStepUpGrants(admin.id).catch((err) =>
      apiConsole.warn("[TOTP Disable] step-up grant 清理失败:", err)
    );

    await finishAuditLog(auditId, "SUCCESS", { action: "totp_disabled" });

    const response = NextResponse.json({ success: true, data: { message: "二次验证已关闭" } });
    response.cookies.set(ADMIN_STEP_UP_COOKIE_NAME, "", {
      ...ADMIN_STEP_UP_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return response;
  } catch (error) {
    apiConsole.error("[TOTP Disable] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

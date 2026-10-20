import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import {
  ADMIN_TOTP_SETUP_COOKIE_NAME,
  ADMIN_TOTP_SETUP_COOKIE_OPTIONS,
  verifyAdminTotpSetupToken,
} from "@/lib/admin-totp-recovery";
import { decryptTOTPSecret, verifyTOTP } from "@/lib/totp";
import { consumeAccessTokenOnce } from "@/lib/token-blacklist";
import { revokeAllAdminStepUpGrants } from "@/lib/admin-step-up";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  code: z.string().trim().length(6, "请输入 6 位验证码"),
});

/**
 * POST /api/admin/totp/recovery/setup/verify
 * 验证新 TOTP 首个验证码，启用并清除短时 setup cookie。
 */
export async function POST(request: NextRequest) {
  try {
    if (!validateCSRFToken(request)) return csrfForbiddenResponse();

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-totp-recovery");
    if (rateLimitResponse) return rateLimitResponse;

    const setupToken = request.cookies.get(ADMIN_TOTP_SETUP_COOKIE_NAME)?.value;
    const subject = setupToken ? await verifyAdminTotpSetupToken(setupToken) : null;
    if (!subject) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "SETUP_SESSION_EXPIRED", message: "恢复会话已过期，请重新登录" },
        },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const parsed = verifySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { id: subject.adminId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        deletedAt: true,
        totpSecret: true,
        totpEnabled: true,
        totpResetRequired: true,
        tokenVersion: true,
      },
    });
    if (!admin || admin.deletedAt || admin.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: { code: "ADMIN_INACTIVE", message: "管理员账号不可用" } },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (admin.tokenVersion !== subject.tokenVersion) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "SETUP_SESSION_EXPIRED", message: "恢复会话已失效，请重新登录" },
        },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (admin.totpEnabled) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOTP_ALREADY_ENABLED", message: "二次验证已启用，请直接登录" },
        },
        { status: 400 }
      );
    }
    if (!admin.totpResetRequired) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "RECOVERY_NOT_REQUIRED", message: "当前无需恢复二次验证" },
        },
        { status: 400 }
      );
    }
    if (!admin.totpSecret) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_NOT_SETUP", message: "请先开始二次验证设置" } },
        { status: 400 }
      );
    }

    const secret = decryptTOTPSecret(admin.totpSecret);
    if (!verifyTOTP(parsed.data.code, secret)) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_INVALID", message: "验证码错误" } },
        { status: 400 }
      );
    }

    const replayKey = `totp:${admin.id}:${parsed.data.code}`;
    if (!(await consumeAccessTokenOnce(replayKey))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOTP_INVALID", message: "验证码已被使用，请等待刷新后重试" },
        },
        { status: 400 }
      );
    }

    const auditDetail = { action: "totp_recovery_enabled" };
    const auditId = await beginAuditLog({
      action: "update_admin",
      targetType: "admin",
      targetId: admin.id,
      detail: auditDetail,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "recovery_code",
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

    await prisma.$transaction(async (tx) => {
      await tx.admin.update({
        where: { id: admin.id },
        data: { totpEnabled: true, totpResetRequired: false, tokenVersion: { increment: 1 } },
      });
      await tx.adminTotpRecovery.deleteMany({
        where: { adminId: admin.id, usedAt: null },
      });
    });
    await revokeAllAdminStepUpGrants(admin.id).catch((err) =>
      apiConsole.warn("[AdminTOTPRecovery] 启用后清理 step-up 失败:", err)
    );
    await finishAuditLog(auditId, "SUCCESS", auditDetail);

    const response = NextResponse.json(
      { success: true, data: { message: "二次验证已重新启用，请重新登录" } },
      { headers: { "Cache-Control": "no-store, private" } }
    );
    response.cookies.set(ADMIN_TOTP_SETUP_COOKIE_NAME, "", {
      ...ADMIN_TOTP_SETUP_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return response;
  } catch (error) {
    apiConsole.error("[AdminTOTPRecovery] 重新绑定失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

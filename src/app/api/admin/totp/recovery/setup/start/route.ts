import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import prisma from "@/lib/prisma";
import { checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { ADMIN_TOTP_SETUP_COOKIE_NAME, verifyAdminTotpSetupToken } from "@/lib/admin-totp-recovery";
import {
  encryptTOTPSecret,
  generateBackupCodes,
  generateTOTPQRCodeUrl,
  generateTOTPSecret,
  hashBackupCode,
} from "@/lib/totp";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/totp/recovery/setup/start
 * 恢复码登录后，用短时 setup cookie 重新生成 TOTP 密钥（尚未启用）。
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

    const admin = await prisma.admin.findUnique({
      where: { id: subject.adminId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        deletedAt: true,
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

    const secret = generateTOTPSecret();
    const issuer = process.env.NEXT_PUBLIC_APP_NAME || "NIHPLOD";
    const qrCodeUrl = generateTOTPQRCodeUrl(admin.email, secret, issuer);
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl);
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = backupCodes.map(hashBackupCode);
    const encryptedSecret = encryptTOTPSecret(secret);

    const auditDetail = { action: "totp_recovery_setup_started" };
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

    await prisma.admin
      .update({
        where: { id: admin.id },
        data: {
          totpSecret: encryptedSecret,
          totpBackupCodes: JSON.stringify(hashedBackupCodes),
          totpEnabled: false,
        },
      })
      .catch(async (error) => {
        await finishAuditLog(auditId, "FAILURE", auditDetail);
        throw error;
      });

    await finishAuditLog(auditId, "SUCCESS", auditDetail);

    return NextResponse.json(
      { success: true, data: { qrCode: qrCodeDataUrl, secret, backupCodes } },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" } }
    );
  } catch (error) {
    apiConsole.error("[AdminTOTPRecovery] 重新绑定初始化失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

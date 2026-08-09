/**
 * 管理员 TOTP 设置初始化
 * POST /api/admin/totp/setup
 *
 * 生成 TOTP secret 和二维码，但不立即启用。
 * 需要调用 /api/admin/totp/verify-setup 验证首个 code 后才启用。
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import {
  generateTOTPSecret,
  generateTOTPQRCodeUrl,
  encryptTOTPSecret,
  generateBackupCodes,
  hashBackupCode,
} from "@/lib/totp";
import QRCode from "qrcode";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (request: NextRequest, adminPayload) => {
  try {
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_JSON", message: "请求体格式错误" } },
        { status: 400 }
      );
    }
    const password = typeof body.password === "string" ? body.password : "";

    if (!password) {
      return NextResponse.json(
        { success: false, error: { code: "PASSWORD_REQUIRED", message: "请输入当前密码以验证身份" } },
        { status: 400 }
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { id: adminPayload.id },
      select: { id: true, email: true, totpEnabled: true, password: true },
    });

    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "管理员不存在" } },
        { status: 404 }
      );
    }

    // 必须先验证当前密码
    const passwordValid = await verifyPassword(password, admin.password);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PASSWORD", message: "密码错误" } },
        { status: 401 }
      );
    }

    if (admin.totpEnabled) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_ALREADY_ENABLED", message: "二次验证已启用" } },
        { status: 400 }
      );
    }

    const secret = generateTOTPSecret();
    const issuer = process.env.NEXT_PUBLIC_APP_NAME || "NIHPLOD";
    const qrCodeUrl = generateTOTPQRCodeUrl(admin.email, secret, issuer);
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl);

    // 生成备用码（明文仅展示一次）
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = backupCodes.map(hashBackupCode);

    // 加密 secret 和备用码，暂存到管理员记录中（未启用状态）
    // 实际启用由 verify-setup 接口完成
    const encryptedSecret = encryptTOTPSecret(secret);

    // 使用临时 cookie 或 session 传递加密 secret 不够安全，
    // 这里直接更新到数据库但不设置 totpEnabled=true
    // 只有在 verify-setup 成功后才会真正启用
    // 注意：如果管理员放弃完成 setup，secret 会留在数据库中但不启用
    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        totpSecret: encryptedSecret,
        totpBackupCodes: JSON.stringify(hashedBackupCodes),
      },
    });

    await createAuditLog({
      action: "update_admin",
      targetType: "admin",
      targetId: admin.id,
      detail: { action: "totp_setup_initiated" },
      adminId: admin.id,
      request,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        secret,
        backupCodes,
      },
    });

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");

    return response;
  } catch (error) {
    apiConsole.error("[TOTP Setup] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

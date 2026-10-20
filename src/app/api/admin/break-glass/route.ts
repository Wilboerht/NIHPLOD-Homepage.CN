import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { createAuditLogStrict } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/break-glass
 *
 * 仅 owner 可查看测肤子站 break-glass 应急账号。
 * 凭据存储在 enable 变量中，查看动作写审计日志。
 */
export const GET = withAuth(async (request: NextRequest, admin) => {
  if (admin.role !== "owner") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "仅超级管理员可查看应急账号信息" },
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rateLimitResponse = await checkAdminRateLimit(request, "admin-break-glass");
  if (rateLimitResponse) return rateLimitResponse;

  const username = process.env.ADVISOR_BREAK_GLASS_USERNAME || "";
  const password = process.env.ADVISOR_BREAK_GLASS_PASSWORD || "";
  const totpSecret = process.env.ADVISOR_BREAK_GLASS_TOTP_SECRET || "";
  const configured = Boolean(username && password && totpSecret);

  const otpauthUrl =
    process.env.ADVISOR_BREAK_GLASS_OTPAUTH_URL ||
    (configured
      ? `otpauth://totp/${encodeURIComponent(`NIHPLOD:${username}`)}?secret=${encodeURIComponent(totpSecret)}&issuer=NIHPLOD&algorithm=SHA1&digits=6&period=30`
      : "");

  let qrCode = "";
  if (configured && otpauthUrl) {
    try {
      qrCode = await QRCode.toDataURL(otpauthUrl, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#00263E", light: "#FFFFFF" },
      });
    } catch (error) {
      apiConsole.error("[BreakGlass] 生成二维码失败:", error);
    }
  }

  await createAuditLogStrict({
    action: "break_glass_view",
    targetType: "system",
    detail: { configured, username: configured ? username : undefined },
    adminId: admin.id,
    request,
  });

  return NextResponse.json(
    {
      success: true,
      data: configured
        ? {
            configured: true,
            username,
            password,
            totpSecret,
            otpauthUrl,
            qrCode,
          }
        : { configured: false },
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
});

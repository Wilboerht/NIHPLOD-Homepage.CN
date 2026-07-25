/**
 * 管理员 TOTP 关闭
 * POST /api/admin/totp/disable
 *
 * 需要验证当前密码才能关闭 TOTP。
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

const disableSchema = z.object({
  password: z.string().min(1, "请输入密码"),
});

export const dynamic = "force-dynamic";

export const POST = withAuth(async (request: NextRequest, adminPayload) => {
  try {
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
      select: { id: true, password: true, totpEnabled: true },
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

    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodes: null,
      },
    });

    await createAuditLog({
      action: "update_admin",
      targetType: "admin",
      targetId: admin.id,
      detail: { action: "totp_disabled" },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { message: "二次验证已关闭" } });
  } catch (error) {
    apiConsole.error("[TOTP Disable] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

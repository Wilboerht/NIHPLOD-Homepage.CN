/**
 * 管理员 TOTP 状态查询
 * GET /api/admin/totp/status
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request: NextRequest, adminPayload) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: adminPayload.id },
      select: { totpEnabled: true, totpEnabledAt: true, totpBackupCodes: true },
    });

    // 备用码使用后会从数组中移除，剩余数量即可用数量
    let backupCodesRemaining = 0;
    if (admin?.totpBackupCodes) {
      try {
        const codes: unknown = JSON.parse(admin.totpBackupCodes);
        backupCodesRemaining = Array.isArray(codes) ? codes.length : 0;
      } catch {
        backupCodesRemaining = 0;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totpEnabled: admin?.totpEnabled ?? false,
        totpEnabledAt: admin?.totpEnabledAt?.toISOString() ?? null,
        backupCodesRemaining,
      },
    });
  } catch (error) {
    apiConsole.error("[TOTP Status] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

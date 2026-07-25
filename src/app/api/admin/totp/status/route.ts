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
      select: { totpEnabled: true },
    });

    return NextResponse.json({
      success: true,
      data: { totpEnabled: admin?.totpEnabled ?? false },
    });
  } catch (error) {
    apiConsole.error("[TOTP Status] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

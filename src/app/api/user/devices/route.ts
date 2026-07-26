/**
 * 用户设备管理端点
 * GET /api/user/devices
 *
 * 返回当前用户所有活跃的设备/会话（基于 RefreshToken 记录）。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUserAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id, revokedAt: null },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const data = tokens.map((t) => ({
      id: t.id,
      deviceName: t.deviceName || "未知设备",
      ipAddress: t.ipAddress || "未知 IP",
      createdAt: t.createdAt.toISOString(),
      lastActiveAt: t.expiresAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[Devices] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

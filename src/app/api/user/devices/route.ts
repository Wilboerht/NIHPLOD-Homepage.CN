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
import { maskIp } from "@/lib/mask-phone";

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
        updatedAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const data = tokens.map((t) => ({
      id: t.id,
      deviceName: t.deviceName || "未知设备",
      // 末段脱敏：用户端展示只需辨识大致网络，不暴露精确主机 IP
      ipAddress: t.ipAddress ? maskIp(t.ipAddress) : "未知 IP",
      createdAt: t.createdAt.toISOString(),
      // updatedAt 在每次 token 轮换（刷新）时更新，近似“最后活跃”时间
      lastActiveAt: t.updatedAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
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

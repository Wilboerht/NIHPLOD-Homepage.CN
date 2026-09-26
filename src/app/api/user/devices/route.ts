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
import { hashRefreshToken } from "@/lib/auth-security";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";

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

    // 当前设备识别：请求携带的 refresh token Cookie 哈希与记录 token 哈希比对
    const currentRefreshToken = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;
    const currentHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;

    const tokens = await prisma.refreshToken.findMany({
      // 仅未撤销且未过期（30 天后未撤销的陈旧记录不应继续展示为活跃设备）
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        token: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 兜底：无 refresh token Cookie（如 Bearer/OAuth 场景读不到）时，
    // 以最近活跃的一条记录视作当前设备，避免当前设备也显示"强制下线"
    const fallbackCurrentId =
      currentHash === null && tokens.length > 0
        ? tokens.reduce((latest, t) => (t.updatedAt > latest.updatedAt ? t : latest)).id
        : null;

    const data = tokens.map((t) => ({
      id: t.id,
      deviceName: t.deviceName || "未知设备",
      // 末段脱敏：用户端展示只需辨识大致网络，不暴露精确主机 IP
      ipAddress: t.ipAddress ? maskIp(t.ipAddress) : "未知 IP",
      createdAt: t.createdAt.toISOString(),
      // updatedAt 在每次 token 轮换（刷新）时更新，近似“最后活跃”时间
      lastActiveAt: t.updatedAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      isCurrent:
        (currentHash !== null && t.token === currentHash) || t.id === fallbackCurrentId,
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

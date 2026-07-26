/**
 * 用户 OAuth 授权列表端点
 * GET /api/user/oauth/sessions
 *
 * 返回当前用户所有活跃的 OAuth 授权记录（含 client 名称）。
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

    const sessions = await prisma.oAuthSession.findMany({
      where: { userId: user.id, revokedAt: null },
      select: {
        clientId: true,
        scopes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 批量获取 client 名称
    const clientIds = [...new Set(sessions.map((s) => s.clientId))];
    const clients =
      clientIds.length > 0
        ? await prisma.oAuthClient.findMany({
            where: { clientId: { in: clientIds } },
            select: { clientId: true, name: true },
          })
        : [];

    const clientNameMap = new Map(clients.map((c) => [c.clientId, c.name]));

    const data = sessions.map((s) => ({
      clientId: s.clientId,
      clientName: clientNameMap.get(s.clientId) || s.clientId,
      scopes: s.scopes,
      createdAt: s.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[OAuth Sessions] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

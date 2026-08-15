/**
 * 用户 OAuth 授权列表端点
 * GET /api/user/oauth/sessions
 *
 * 返回当前用户所有活跃的 OAuth 授权记录（含 client 名称）。
 * 同一 client 可能存在多条 session（多次授权/多设备），按 clientId 去重，
 * 每 client 仅返回最近创建的一条。
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

    // 按 clientId 去重：sessions 已按 createdAt 倒序，首个出现的即该 client 最近的 session
    const seen = new Set<string>();
    const data = [];
    for (const s of sessions) {
      if (seen.has(s.clientId)) continue;
      seen.add(s.clientId);
      data.push({
        clientId: s.clientId,
        clientName: clientNameMap.get(s.clientId) || s.clientId,
        scopes: s.scopes,
        createdAt: s.createdAt.toISOString(),
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[OAuth Sessions] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

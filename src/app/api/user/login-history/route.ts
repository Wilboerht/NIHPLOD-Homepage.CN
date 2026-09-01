/**
 * 用户登录历史端点
 * GET /api/user/login-history
 *
 * 返回当前用户最近的登录尝试记录。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { maskIp } from "@/lib/mask-phone";
import { hashIdentifier } from "@/lib/auth-security";

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

    // 登录历史按手机号聚合（identifier 字段存 HMAC 哈希，需同样哈希后比对），
    // access token 已不再携带明文手机号，此处按 id 查库获取当前手机号
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    });
    if (!userRecord) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const attempts = await prisma.loginAttempt.findMany({
      where: { identifier: hashIdentifier(userRecord.phone) },
      select: {
        id: true,
        identifier: true,
        type: true,
        success: true,
        reason: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const data = attempts.map((a) => ({
      id: a.id,
      type: a.type,
      success: a.success,
      reason: a.reason,
      // 末段脱敏：不向用户端暴露精确主机 IP
      ipAddress: a.ipAddress ? maskIp(a.ipAddress) : "未知 IP",
      createdAt: a.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[LoginHistory] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

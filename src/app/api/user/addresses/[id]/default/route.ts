/**
 * 设置默认地址 API
 * PUT /api/user/addresses/:id/default - 设置为默认地址
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.address.findFirst({
      where: { id, userId: payload.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "地址不存在" } },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId: payload.id, isDefault: true },
        data: { isDefault: false },
      });

      await tx.address.update({
        where: { id },
        data: { isDefault: true },
      });
    });

    return NextResponse.json({ success: true, data: { message: "已设为默认地址" } });
  } catch (error) {
    apiConsole.error("[SetDefaultAddress] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

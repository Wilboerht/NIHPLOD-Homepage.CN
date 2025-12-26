/**
 * 单个对话 API
 * GET /api/user/conversations/:id - 获取对话详情
 * DELETE /api/user/conversations/:id - 删除对话
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

// 获取对话详情
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const conversation = await prisma.advisorConversation.findFirst({
      where: { id, userId: payload.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "对话不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { conversation },
    });
  } catch (error) {
    console.error("[GetConversation] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// 删除对话
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    // 检查对话是否存在且属于当前用户
    const existing = await prisma.advisorConversation.findFirst({
      where: { id, userId: payload.id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "对话不存在" } },
        { status: 404 }
      );
    }

    // 删除对话及其消息
    await prisma.advisorConversation.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      data: { message: "对话已删除" },
    });
  } catch (error) {
    console.error("[DeleteConversation] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


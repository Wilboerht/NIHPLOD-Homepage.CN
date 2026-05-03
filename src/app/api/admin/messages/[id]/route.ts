import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 更新留言 Schema
const UpdateSchema = z.object({
  read: z.boolean().optional(),
});

// GET /api/admin/messages/[id] - 获取留言详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const message = await prisma.contactMessage.findUnique({
      where: { id },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "留言不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...message,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("获取留言详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取留言详情失败" } },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/messages/[id] - 更新留言（标记已读）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validated = UpdateSchema.parse(body);

    // 检查是否存在
    const existing = await prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "留言不存在" } },
        { status: 404 }
      );
    }

    // 更新留言
    const message = await prisma.contactMessage.update({
      where: { id },
      data: {
        ...(validated.read !== undefined && { read: validated.read }),
      },
    });

    revalidateTag("admin-stats");

    return NextResponse.json({
      success: true,
      data: {
        ...message,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("更新留言失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新留言失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/messages/[id] - 删除留言
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    // 检查是否存在
    const existing = await prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "留言不存在" } },
        { status: 404 }
      );
    }

    // 删除留言
    await prisma.contactMessage.delete({ where: { id } });

    revalidateTag("admin-stats");

    return NextResponse.json({
      success: true,
      data: { message: "留言已删除" },
    });
  } catch (error) {
    console.error("删除留言失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除留言失败" } },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { deleteUploadedFile } from "@/lib/upload";
import { z } from "zod";

// 更新 Schema
const UpdateSchema = z.object({
  alt: z.string().max(200).optional(),
  filename: z.string().max(200).optional(),
});

// GET /api/admin/media/[id] - 获取媒体详情
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

    const media = await prisma.media.findUnique({
      where: { id },
    });

    if (!media) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "媒体不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...media,
        createdAt: media.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("获取媒体详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取媒体详情失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/media/[id] - 更新媒体信息
export async function PUT(
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
    const existing = await prisma.media.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "媒体不存在" } },
        { status: 404 }
      );
    }

    // 更新
    const media = await prisma.media.update({
      where: { id },
      data: {
        ...(validated.alt !== undefined && { alt: validated.alt || null }),
        ...(validated.filename && { filename: validated.filename }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...media,
        createdAt: media.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("更新媒体失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新媒体失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/media/[id] - 删除媒体
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
    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "媒体不存在" } },
        { status: 404 }
      );
    }

    // 删除文件
    await deleteUploadedFile(media.url);

    // 删除数据库记录
    await prisma.media.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      data: { message: "删除成功" },
    });
  } catch (error) {
    console.error("删除媒体失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除媒体失败" } },
      { status: 500 }
    );
  }
}


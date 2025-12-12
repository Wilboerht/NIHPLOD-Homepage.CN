import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

// 更新分类夹 Schema
const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(200).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

// GET /api/admin/application-folders/[id] - 获取分类夹详情
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const folder = await prisma.applicationFolder.findUnique({
      where: { id },
      include: {
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "分类夹不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...folder,
        applicationCount: folder._count.applications,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("获取分类夹详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取分类夹详情失败" } },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/application-folders/[id] - 更新分类夹
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
    const validated = UpdateFolderSchema.parse(body);

    const existing = await prisma.applicationFolder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "分类夹不存在" } },
        { status: 404 }
      );
    }

    const folder = await prisma.applicationFolder.update({
      where: { id },
      data: validated,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...folder,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.errors[0].message } },
        { status: 400 }
      );
    }
    console.error("更新分类夹失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新分类夹失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/application-folders/[id] - 删除分类夹
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const existing = await prisma.applicationFolder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "分类夹不存在" } },
        { status: 404 }
      );
    }

    // 删除分类夹（关联的申请会自动设为 null）
    await prisma.applicationFolder.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      data: { message: "分类夹已删除" },
    });
  } catch (error) {
    console.error("删除分类夹失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除分类夹失败" } },
      { status: 500 }
    );
  }
}


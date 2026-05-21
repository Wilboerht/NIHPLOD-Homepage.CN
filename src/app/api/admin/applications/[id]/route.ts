import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/upload";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  status: z.enum(["pending", "reviewed", "interviewed", "rejected", "hired"]).optional(),
  notes: z.string().max(5000, "备注最多5000字符").optional(),
  folderId: z.string().min(1).optional().nullable(),
});

// GET /api/admin/applications/[id] - 获取单个申请详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

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

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            titleEn: true,
            location: true,
            type: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    apiConsole.error("获取申请详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/applications/[id] - 更新申请状态
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
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: parsed.error.issues } },
        { status: 400 }
      );
    }
    const { status, notes, folderId } = parsed.data;

    // 验证分类夹是否存在
    if (folderId && folderId !== null) {
      const folder = await prisma.applicationFolder.findUnique({ where: { id: folderId } });
      if (!folder) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_FOLDER", message: "分类夹不存在" } },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (folderId !== undefined) updateData.folderId = folderId; // null 表示移除分类

    const application = await prisma.jobApplication.update({
      where: { id },
      data: updateData,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            titleEn: true,
          },
        },
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    apiConsole.error("更新申请失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/applications/[id] - 删除申请
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

    // 先获取申请记录以删除关联的简历文件
    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: { resumePath: true },
    });

    if (application?.resumePath) {
      await deleteUploadedFile(application.resumePath);
    }

    await prisma.jobApplication.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "删除成功" });
  } catch (error) {
    apiConsole.error("删除申请失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除失败" } },
      { status: 500 }
    );
  }
}


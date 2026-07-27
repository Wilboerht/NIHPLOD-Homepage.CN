import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// 创建分类夹 Schema
const CreateFolderSchema = z.object({
  name: z.string().min(1, "请输入分类名称").max(50, "名称最多50个字符"),
  description: z.string().max(200, "描述最多200个字符").optional(),
});

// GET /api/admin/application-folders - 获取分类夹列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const folders = await prisma.applicationFolder.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: {
        _count: {
          select: { applications: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        description: folder.description,
        order: folder.order,
        applicationCount: folder._count.applications,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    apiConsole.error("获取分类夹列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "获取分类夹列表失败" } },
      { status: 500 }
    );
  }
}

// POST /api/admin/application-folders - 创建分类夹
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const body = await request.json();
    const validated = CreateFolderSchema.parse(body);

    // 获取最大排序值
    const maxOrder = await prisma.applicationFolder.aggregate({
      _max: { order: true },
    });

    const folder = await prisma.applicationFolder.create({
      data: {
        name: validated.name,
        description: validated.description || null,
        order: (maxOrder._max.order || 0) + 1,
      },
    });

    await createAuditLog({
      action: "create_application_folder",
      targetType: "application_folder",
      targetId: folder.id,
      detail: { name: validated.name },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...folder,
        applicationCount: 0,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.issues[0].message } },
        { status: 400 }
      );
    }
    apiConsole.error("创建分类夹失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "创建分类夹失败" } },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { deleteUploadedFile } from "@/lib/upload";
import prisma from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// DELETE /api/upload/[...path] - 删除图片
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    // 验证认证
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const canManageMedia = (
      [
        "products:write",
        "categories:write",
        "jobs:write",
        "applications:write",
        "sso:clients:write",
      ] as const
    ).some((permission) => hasAdminPermission(admin, permission));
    if (!canManageMedia) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "无媒体删除权限" } },
        { status: 403 }
      );
    }

    const { path } = await params;
    // 防止 ../ 或反斜杠路径遍历删除上传目录外文件
    if (path.some((part) => part === ".." || part.includes("\\"))) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PATH", message: "非法文件路径" } },
        { status: 400 }
      );
    }
    const filePath = `/uploads/${path.join("/")}`;

    // 从数据库中查找关联的图片记录
    const imageRecord = await prisma.image.findFirst({
      where: { url: filePath },
    });

    // 删除数据库记录（如果存在）
    if (imageRecord) {
      await prisma.image.delete({
        where: { id: imageRecord.id },
      });
    }

    // 删除文件
    const deleted = await deleteUploadedFile(filePath);

    if (!deleted && !imageRecord) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "文件不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "删除成功",
        deletedFile: deleted,
        deletedRecord: !!imageRecord,
      },
    });
  } catch (error) {
    apiConsole.error("删除失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "DELETE_ERROR", message: "删除失败" } },
      { status: 500 }
    );
  }
}

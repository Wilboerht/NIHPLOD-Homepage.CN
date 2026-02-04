import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { deleteUploadedFile } from "@/lib/upload";
import { z } from "zod";

// 批量操作 Schema
const BatchSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["delete"]),
});

// POST /api/admin/media/batch - 批量操作
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { ids, action } = BatchSchema.parse(body);

    if (action === "delete") {
      // 获取所有媒体记录
      const mediaList = await prisma.media.findMany({
        where: { id: { in: ids } },
      });

      // 删除文件
      for (const media of mediaList) {
        await deleteUploadedFile(media.url);
      }

      // 删除数据库记录
      await prisma.media.deleteMany({
        where: { id: { in: ids } },
      });

      return NextResponse.json({
        success: true,
        data: {
          message: `已删除 ${mediaList.length} 个文件`,
          count: mediaList.length,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: { code: "INVALID_ACTION", message: "无效的操作" } },
      { status: 400 }
    );
  } catch (error) {
    console.error("批量操作失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "批量操作失败" } },
      { status: 500 }
    );
  }
}


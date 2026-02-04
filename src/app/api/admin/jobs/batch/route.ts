import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 批量操作 Schema
const BatchSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["publish", "unpublish", "delete"]),
});

// POST /api/admin/jobs/batch - 批量操作
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

    let count = 0;

    if (action === "publish") {
      const result = await prisma.job.updateMany({
        where: { id: { in: ids } },
        data: { published: true },
      });
      count = result.count;
    } else if (action === "unpublish") {
      const result = await prisma.job.updateMany({
        where: { id: { in: ids } },
        data: { published: false },
      });
      count = result.count;
    } else if (action === "delete") {
      const result = await prisma.job.deleteMany({
        where: { id: { in: ids } },
      });
      count = result.count;
    }

    const actionText = {
      publish: "发布",
      unpublish: "取消发布",
      delete: "删除",
    }[action];

    return NextResponse.json({
      success: true,
      data: {
        message: `已${actionText} ${count} 个职位`,
        count,
      },
    });
  } catch (error) {
    console.error("批量操作失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "批量操作失败" } },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";

// 批量操作 Schema
const BatchSchema = z.object({
  ids: z.array(z.string().cuid()).min(1, "请选择至少一条留言").max(100, "一次最多操作 100 条留言"),
  action: z.enum(["read", "unread", "delete"]),
});

// POST /api/admin/messages/batch - 批量操作留言
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

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

    const body = await request.json();
    const { ids, action } = BatchSchema.parse(body);

    let count = 0;

    if (action === "read") {
      const result = await prisma.contactMessage.updateMany({
        where: { id: { in: ids } },
        data: { read: true },
      });
      count = result.count;
    } else if (action === "unread") {
      const result = await prisma.contactMessage.updateMany({
        where: { id: { in: ids } },
        data: { read: false },
      });
      count = result.count;
    } else if (action === "delete") {
      const result = await prisma.contactMessage.deleteMany({
        where: { id: { in: ids } },
      });
      count = result.count;
    }

    const actionText = {
      read: "标记为已读",
      unread: "标记为未读",
      delete: "删除",
    }[action];

    createAuditLog({
      action: "batch_message",
      targetType: "message",
      targetId: ids[0],
      detail: { ids, action, count },
      adminId: admin.id,
      request,
    }).catch(() => {});

    revalidateTag("admin-stats", "max");

    return NextResponse.json({
      success: true,
      data: {
        message: `已${actionText} ${count} 条留言`,
        count,
      },
    });
  } catch (error) {
    apiConsole.error("批量操作失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "批量操作失败" } },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { deleteUploadedFile } from "@/lib/upload";

// 批量操作 Schema
const BatchActionSchema = z.object({
  ids: z.array(z.string().cuid()).min(1, "请选择至少一个产品").max(100, "一次最多操作 100 个产品"),
  action: z.enum(["publish", "unpublish", "delete"]),
});

// POST /api/admin/products/batch - 批量操作产品
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 验证认证
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

    // 解析请求体
    const body = await request.json();
    const parsed = BatchActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }
    const { ids, action } = parsed.data;

    let result: { count: number };

    switch (action) {
      case "publish":
        result = await prisma.product.updateMany({
          where: { id: { in: ids } },
          data: { published: true },
        });
        break;

      case "unpublish":
        result = await prisma.product.updateMany({
          where: { id: { in: ids } },
          data: { published: false },
        });
        break;

      case "delete": {
        // 删除关联的物理图片文件（先查，后删DB，最后删文件）
        const images = await prisma.image.findMany({
          where: { productId: { in: ids } },
          select: { url: true },
        });
        // 删除产品（级联删除关联的图片数据库记录）
        result = await prisma.product.deleteMany({
          where: { id: { in: ids } },
        });
        for (const img of images) {
          await deleteUploadedFile(img.url);
        }
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: { code: "INVALID_ACTION", message: "无效的操作类型" } },
          { status: 400 }
        );
    }

    const actionMessages = {
      publish: "发布",
      unpublish: "取消发布",
      delete: "删除",
    };

    revalidateTag("admin-stats", "max");

    // 记录审计日志
    createAuditLog({
      action: "batch_product",
      targetType: "product",
      targetId: "batch",
      detail: { action, ids, affected: result.count },
      adminId: admin.id,
      request,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        affected: result.count,
        message: `成功${actionMessages[action]} ${result.count} 个产品`,
      },
    });
  } catch (error) {
    apiConsole.error("批量操作失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues },
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

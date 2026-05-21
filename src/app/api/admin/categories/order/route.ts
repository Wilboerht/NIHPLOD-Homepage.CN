import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

// 排序更新 Schema
const OrderUpdateSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      order: z.number().int().min(0),
    })
  ).min(1, "请提供至少一个分类"),
});

// PUT /api/admin/categories/order - 更新分类排序
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { items } = OrderUpdateSchema.parse(body);

    // 批量更新排序
    await prisma.$transaction(
      items.map((item) =>
        prisma.category.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    );

    return NextResponse.json({
      success: true,
      data: {
        updated: items.length,
        message: `成功更新 ${items.length} 个分类的排序`,
      },
    });
  } catch (error) {
    apiConsole.error("更新排序失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新排序失败" } },
      { status: 500 }
    );
  }
}


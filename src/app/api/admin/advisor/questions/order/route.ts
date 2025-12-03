import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 排序 Schema
const OrderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      order: z.number(),
    })
  ),
});

// PUT /api/admin/advisor/questions/order - 更新问题排序
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
    const { items } = OrderSchema.parse(body);

    // 批量更新排序
    await prisma.$transaction(
      items.map((item) =>
        prisma.advisorQuestion.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    );

    return NextResponse.json({
      success: true,
      data: { message: "排序已更新" },
    });
  } catch (error) {
    console.error("更新排序失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新排序失败" } },
      { status: 500 }
    );
  }
}


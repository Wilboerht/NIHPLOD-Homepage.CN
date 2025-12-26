/**
 * 购物车单项操作 API
 * PUT /api/cart/:id - 更新购物车项
 * DELETE /api/cart/:id - 删除购物车项
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

// 更新参数验证
const updateSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  selected: z.boolean().optional(),
});

// 更新购物车项
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();

    const result = updateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    // 检查购物车项是否存在
    const existing = await prisma.cartItem.findFirst({
      where: { id, userId: payload.id },
      include: { product: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "购物车项不存在" } },
        { status: 404 }
      );
    }

    const { quantity } = result.data;

    // 如果更新数量，检查库存
    if (quantity !== undefined) {
      const stock = existing.product.stock;
      if (stock < quantity) {
        return NextResponse.json(
          { success: false, error: { code: "INSUFFICIENT_STOCK", message: "库存不足" } },
          { status: 400 }
        );
      }
    }

    const cartItem = await prisma.cartItem.update({
      where: { id },
      data: {
        ...(quantity !== undefined && { quantity }),
      },
    });

    return NextResponse.json({
      success: true,
      data: { cartItem },
    });
  } catch (error) {
    console.error("[UpdateCartItem] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// 删除购物车项
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    // 检查购物车项是否存在
    const existing = await prisma.cartItem.findFirst({
      where: { id, userId: payload.id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "购物车项不存在" } },
        { status: 404 }
      );
    }

    await prisma.cartItem.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      data: { message: "已从购物车移除" },
    });
  } catch (error) {
    console.error("[DeleteCartItem] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


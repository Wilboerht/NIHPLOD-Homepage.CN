/**
 * 购物车单项操作 API
 * PUT /api/cart/:id - 更新购物车项
 * DELETE /api/cart/:id - 删除购物车项
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

type RouteContext = { params: Promise<{ id: string }> };

// 更新参数验证
const updateSchema = z.object({
  quantity: z.number().int().min(1).max(999, "购物车单商品数量不能超过999").optional(),
});

// 更新购物车项
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

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
      where: { id, userId: payload.id },
      data: {
        ...(quantity !== undefined && { quantity }),
      },
    });

    return NextResponse.json({
      success: true,
      data: { cartItem },
    });
  } catch (error) {
    apiConsole.error("[UpdateCartItem] 异常:", error);
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

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const { id } = await context.params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

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

    await prisma.cartItem.delete({ where: { id, userId: payload.id } });

    return NextResponse.json({
      success: true,
      data: { message: "已从购物车移除" },
    });
  } catch (error) {
    apiConsole.error("[DeleteCartItem] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

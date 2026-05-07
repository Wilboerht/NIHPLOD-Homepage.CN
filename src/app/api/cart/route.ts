/**
 * 购物车 API
 * GET /api/cart - 获取购物车
 * POST /api/cart - 添加商品到购物车
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { z } from "zod";

// 添加购物车参数验证
const addCartSchema = z.object({
  productId: z.string().min(1, "商品ID不能为空"),
  quantity: z.number().int().min(1, "数量至少为1").default(1),
});

// 获取购物车
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { userId: payload.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            stock: true,
            published: true,
            allowDirectBuy: true,
            images: { take: 1, select: { url: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 计算总价
    let totalPrice = 0;
    let totalItems = 0;

    const items = cartItems.map((item) => {
      const price = Number(item.product.price);
      const subtotal = price * item.quantity;
      totalPrice += subtotal;
      totalItems += item.quantity;

      return {
        id: item.id,
        product: {
          ...item.product,
          featuredImage: item.product.images[0]?.url || null,
        },
        quantity: item.quantity,
        price,
        subtotal,
        createdAt: item.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        items,
        totalItems,
        totalPrice,
      },
    });
  } catch (error) {
    console.error("[GetCart] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// 添加商品到购物车
export async function POST(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    const result = addCartSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { productId, quantity } = result.data;

    // 检查商品是否存在且可购买
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || !product.published) {
      return NextResponse.json(
        { success: false, error: { code: "PRODUCT_NOT_FOUND", message: "商品不存在或已下架" } },
        { status: 404 }
      );
    }

    // 检查是否允许站内购买
    if (!product.allowDirectBuy) {
      return NextResponse.json(
        { success: false, error: { code: "DIRECT_BUY_NOT_ALLOWED", message: "该商品不支持站内购买" } },
        { status: 400 }
      );
    }

    // 使用事务保证库存检查和购物车操作的原子性
    let cartItem;
    try {
      cartItem = await prisma.$transaction(async (tx) => {
        const currentProduct = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true, published: true, allowDirectBuy: true },
        });
        if (!currentProduct || !currentProduct.published) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        if (!currentProduct.allowDirectBuy) {
          throw new Error("DIRECT_BUY_NOT_ALLOWED");
        }
        if (currentProduct.stock < quantity) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        const existing = await tx.cartItem.findUnique({
          where: { userId_productId: { userId: payload.id, productId } },
        });

        if (existing) {
          return tx.cartItem.update({
            where: { id: existing.id },
            data: { quantity: { increment: quantity } },
          });
        }
        return tx.cartItem.create({
          data: { userId: payload.id, productId, quantity },
        });
      });
    } catch (txError) {
      if (txError instanceof Error) {
        if (txError.message === "PRODUCT_NOT_FOUND") {
          return NextResponse.json(
            { success: false, error: { code: "PRODUCT_NOT_FOUND", message: "商品不存在或已下架" } },
            { status: 404 }
          );
        }
        if (txError.message === "DIRECT_BUY_NOT_ALLOWED") {
          return NextResponse.json(
            { success: false, error: { code: "DIRECT_BUY_NOT_ALLOWED", message: "该商品不支持站内购买" } },
            { status: 400 }
          );
        }
        if (txError.message === "INSUFFICIENT_STOCK") {
          return NextResponse.json(
            { success: false, error: { code: "INSUFFICIENT_STOCK", message: "库存不足" } },
            { status: 400 }
          );
        }
      }
      throw txError;
    }

    return NextResponse.json({
      success: true,
      data: { cartItem, message: "已添加到购物车" },
    });
  } catch (error) {
    console.error("[AddToCart] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


/**
 * 获取结算数据 API
 * GET /api/checkout/data
 * 
 * 支持两种模式：
 * 1. 购物车结算：不传参数，从 CartItem 表读取
 * 2. 直接购买：传 ?productIds=id1,id2，从 Product 表直接读取（不依赖购物车）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";

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

    const { searchParams } = new URL(request.url);
    const productIdsParam = searchParams.get("productIds");

    let items;

    if (productIdsParam) {
      // ========== 直接购买模式：从 Product 表读取 ==========
      const productIds = productIdsParam.split(",").filter(Boolean);

      if (productIds.length === 0) {
        return NextResponse.json(
          { success: false, error: { code: "EMPTY_CART", message: "没有可结算的商品" } },
          { status: 400 }
        );
      }

      const products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          published: true,
          allowDirectBuy: true,
        },
        include: {
          images: {
            take: 1,
            orderBy: { order: "asc" },
            select: { url: true },
          },
        },
      });

      if (products.length === 0) {
        return NextResponse.json(
          { success: false, error: { code: "EMPTY_CART", message: "没有可结算的商品" } },
          { status: 400 }
        );
      }

      // 校验库存（直接购买默认数量为 1）
      for (const product of products) {
        if (product.stock < 1) {
          return NextResponse.json(
            { success: false, error: { code: "INSUFFICIENT_STOCK", message: `${product.name} 库存不足` } },
            { status: 400 }
          );
        }
      }

      items = products.map((product) => ({
        productId: product.id,
        variantId: null,
        productName: product.name,
        variantName: null,
        price: Number(product.price),
        quantity: 1,
        image: product.images[0]?.url || null,
      }));
    } else {
      // ========== 购物车模式：从 CartItem 表读取 ==========
      const cartItems = await prisma.cartItem.findMany({
        where: { userId: payload.id },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              stock: true,
              published: true,
              allowDirectBuy: true,
              images: {
                take: 1,
                orderBy: { order: "asc" },
                select: { url: true },
              },
            },
          },
        },
      });

      if (cartItems.length === 0) {
        return NextResponse.json(
          { success: false, error: { code: "EMPTY_CART", message: "购物车为空" } },
          { status: 400 }
        );
      }

      // 校验购物车商品有效性
      const invalidItems: string[] = [];
      items = cartItems
        .filter((item) => {
          const product = item.product;
          if (!product.published) {
            invalidItems.push(`${product.name} 已下架`);
            return false;
          }
          if (!product.allowDirectBuy) {
            invalidItems.push(`${product.name} 不支持站内购买`);
            return false;
          }
          if (product.stock < item.quantity) {
            invalidItems.push(`${product.name} 库存不足`);
            return false;
          }
          return true;
        })
        .map((item) => ({
          productId: item.productId,
          variantId: null,
          productName: item.product.name,
          variantName: null,
          price: Number(item.product.price),
          quantity: item.quantity,
          image: item.product.images[0]?.url || null,
        }));

      if (items.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_CART_ITEMS",
              message: invalidItems.join("；") || "购物车商品不可用",
            },
          },
          { status: 400 }
        );
      }
    }

    // 获取用户地址（两种模式共用）
    const addresses = await prisma.address.findMany({
      where: { userId: payload.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        phone: true,
        province: true,
        city: true,
        district: true,
        detail: true,
        isDefault: true,
      },
    });

    const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    return NextResponse.json({
      success: true,
      data: {
        items,
        addresses,
        totalPrice,
      },
    });
  } catch (error) {
    console.error("[CheckoutData] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

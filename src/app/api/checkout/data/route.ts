/**
 * 获取结算数据 API
 * GET /api/checkout/data
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    // 获取购物车商品
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: payload.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            stock: true,
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

    // 获取用户地址
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

    // 格式化数据
    const items = cartItems.map((item) => ({
      productId: item.productId,
      variantId: null,
      productName: item.product.name,
      variantName: null,
      price: Number(item.product.price),
      quantity: item.quantity,
      image: item.product.images[0]?.url || null,
    }));

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


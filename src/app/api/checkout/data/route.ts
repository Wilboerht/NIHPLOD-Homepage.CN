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
import { apiConsole } from "@/lib/logger";

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
    const quantitiesParam = searchParams.get("quantities");

    let items;

    if (productIdsParam) {
      // ========== 直接购买模式：从 Product 表读取 ==========
      const productIds = productIdsParam.split(",").filter(Boolean);
      // 解析数量参数（与 productIds 一一对应，默认 1）
      const quantities = quantitiesParam
        ? quantitiesParam.split(",").map((q) => Math.max(1, parseInt(q.trim(), 10) || 1))
        : productIds.map(() => 1);

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

      // 按 productId 建立数量映射
      const qtyMap = new Map<string, number>();
      productIds.forEach((id, idx) => qtyMap.set(id, quantities[idx] || 1));

      // 校验库存（使用实际数量）
      for (const product of products) {
        const qty = qtyMap.get(product.id) || 1;
        if (product.stock < qty) {
          return NextResponse.json(
            { success: false, error: { code: "INSUFFICIENT_STOCK", message: `${product.name} 库存不足（剩余 ${product.stock} 件）` } },
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
        quantity: qtyMap.get(product.id) || 1,
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

    // 查询用户可用优惠券（UNUSED 且未过期，满足门槛，且适用于当前商品）
    const now = new Date();
    const availableCoupons = await prisma.userCoupon.findMany({
      where: {
        userId: payload.id,
        status: "UNUSED",
        expiresAt: { gt: now },
        coupon: {
          isActive: true,
          minAmount: { lte: totalPrice },
          AND: [
            { OR: [{ startDate: { lte: now } }, { startDate: null }] },
            { OR: [{ endDate: { gte: now } }, { endDate: null }] },
          ],
        },
      },
      include: {
        coupon: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 获取当前商品的品类ID，用于过滤适用范围
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, categoryId: true },
    });
    const categoryIds = Array.from(new Set(products.map((p) => p.categoryId)));

    // 过滤掉不适用于当前商品的优惠券
    const filteredCoupons = availableCoupons.filter((uc) => {
      const coupon = uc.coupon;
      if (coupon.scopeType === "ALL" || !coupon.scopeType) return true;
      if (coupon.scopeType === "CATEGORY") {
        return categoryIds.some((cid) => coupon.scopeIds.includes(cid));
      }
      if (coupon.scopeType === "PRODUCT") {
        return productIds.some((pid) => coupon.scopeIds.includes(pid));
      }
      return true;
    });

    const coupons = filteredCoupons.map((uc) => ({
      id: uc.id,
      name: uc.coupon.name,
      type: uc.coupon.type,
      value: Number(uc.coupon.value),
      minAmount: Number(uc.coupon.minAmount),
      expiresAt: uc.expiresAt.toISOString(),
    }));

    // 运费计算（简单策略：满 99 元包邮，否则 10 元）
    const FREE_SHIPPING_THRESHOLD = 99;
    const BASE_SHIPPING_FEE = 10;
    const shippingFee = totalPrice >= FREE_SHIPPING_THRESHOLD ? 0 : BASE_SHIPPING_FEE;

    return NextResponse.json({
      success: true,
      data: {
        items,
        addresses,
        totalPrice,
        shippingFee,
        finalTotal: totalPrice + shippingFee,
        availableCoupons: coupons,
      },
    });
  } catch (error) {
    apiConsole.error("[CheckoutData] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

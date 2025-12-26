/**
 * 结算页面
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CheckoutContent from "./CheckoutContent";

export const metadata: Metadata = {
  title: "确认订单 - 你好朵朵",
  description: "确认订单信息并提交",
};

export default async function CheckoutPage() {
  const user = await getCurrentLoginUser();
  
  if (!user) {
    redirect("/login?redirect=/checkout");
  }

  // 获取购物车商品
  const cartItems = await prisma.cartItem.findMany({
    where: { userId: user.id },
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
    redirect("/cart");
  }

  // 获取用户地址
  const addresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">确认订单</h1>
        </div>
      </div>

      <CheckoutContent 
        items={items}
        addresses={addresses}
        totalPrice={totalPrice}
      />
    </div>
  );
}


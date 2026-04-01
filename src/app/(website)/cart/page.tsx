/**
 * 购物车页面
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CartContent from "./CartContent";

export const metadata: Metadata = {
  title: "购物车",
  description: "查看您的购物车",
};

interface CartPageProps {
  searchParams?: {
    openCheckout?: string;
  };
}

export default async function CartPage({ searchParams }: CartPageProps) {
  const user = await getCurrentLoginUser();
  
  if (!user) {
    redirect("/login?redirect=/cart");
  }

  // 获取购物车数据
  const cartItems = await prisma.cartItem.findMany({
    where: { userId: user.id },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
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
    orderBy: { createdAt: "desc" },
  });

  // 格式化数据
  const items = cartItems.map((item) => ({
    id: item.id,
    product: {
      id: item.product.id,
      name: item.product.name,
      slug: item.product.slug,
      price: Number(item.product.price),
      featuredImage: item.product.images[0]?.url || null,
      stock: item.product.stock,
    },
    variant: null,
    quantity: item.quantity,
    selected: true, // 默认选中
    price: Number(item.product.price),
  }));

  const autoOpenCheckout = searchParams?.openCheckout === "1";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">购物车</h1>
        </div>
      </div>

      <CartContent 
        initialItems={items}
        autoOpenCheckout={autoOpenCheckout}
      />
    </div>
  );
}


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
  description:
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
  alternates: {
    canonical: "/cart",
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "购物车 | NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "购物车 | NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
  },
};

interface CartPageProps {
  searchParams: Promise<{
    openCheckout?: string;
  }>;
}

export default async function CartPage({ searchParams }: CartPageProps) {
  const params = await searchParams;
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

  const autoOpenCheckout = params.openCheckout === "1";

  return (
    <div className="min-h-dvh animate-fade-in bg-brand-cream">
      <div className="sticky top-0 z-10 border-b border-brand-charcoal/5 bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-lg font-light tracking-[0.12em] text-brand-charcoal">购物车</h1>
        </div>
      </div>

      <CartContent initialItems={items} autoOpenCheckout={autoOpenCheckout} />
    </div>
  );
}

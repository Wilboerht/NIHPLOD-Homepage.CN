import { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { ProductDetailContent } from "./ProductDetailContent";
import { ProductJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";

// ISR: 产品详情页每60秒重新验证一次
export const revalidate = 60;

// 允许动态生成未预渲染的路由参数
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * 生成静态参数
 * 在构建时尝试预渲染产品页面，如果数据库不可用则返回空数组
 */
export async function generateStaticParams() {
  try {
    const products = await prisma.product.findMany({
      where: { published: true },
      select: { slug: true },
    });

    return products.map((product) => ({
      slug: product.slug,
    }));
  } catch (error) {
    console.error("generateStaticParams 获取产品列表失败:", error);
    // 返回空数组，页面将在运行时动态生成
    return [];
  }
}

/**
 * 生成页面元数据
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  const product = await prisma.product.findUnique({
    where: { slug },
    select: {
      name: true,
      nameEn: true,
      description: true,
      images: { take: 1, select: { url: true } },
    },
  });

  if (!product) {
    return {
      title: "产品未找到 | NIHPLOD 旎柏",
    };
  }

  return {
    title: `${product.name} | NIHPLOD 旎柏`,
    description: product.description.slice(0, 160),
    openGraph: {
      title: `${product.name} - ${product.nameEn}`,
      description: product.description.slice(0, 160),
      images: product.images[0]?.url ? [product.images[0].url] : undefined,
    },
  };
}

/**
 * 获取产品详情
 */
async function getProduct(slug: string) {
  const product = await prisma.product.findUnique({
    where: { slug, published: true },
    include: {
      category: {
        select: { id: true, name: true, nameEn: true, slug: true },
      },
      images: {
        orderBy: { order: "asc" },
        select: { id: true, url: true, alt: true },
      },
    },
  });

  if (!product) return null;

  return {
    ...product,
    price: Number(product.price),
  };
}

/**
 * 获取相关产品（同分类）
 */
async function getRelatedProducts(categoryId: string, currentProductId: string) {
  const products = await prisma.product.findMany({
    where: {
      published: true,
      categoryId,
      id: { not: currentProductId },
    },
    take: 4,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: {
      category: {
        select: { name: true },
      },
      images: {
        take: 2,
        orderBy: { order: "asc" },
        select: { url: true, alt: true },
      },
    },
  });

  return products.map((p) => ({
    ...p,
    price: Number(p.price),
  }));
}

/**
 * 产品详情页
 */
export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const product = await getProduct(slug);

  if (!product) {
    notFound();
  }

  const relatedProducts = await getRelatedProducts(product.categoryId, product.id);

  // 面包屑导航数据
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "产品", url: "/products" },
    { name: product.category.name, url: `/products?category=${product.category.slug}` },
    { name: product.name, url: `/products/${product.slug}` },
  ];

  return (
    <>
      {/* Schema.org 结构化数据 */}
      <ProductJsonLd product={product} />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <ProductDetailContent
        product={product}
        relatedProducts={relatedProducts}
      />
    </>
  );
}


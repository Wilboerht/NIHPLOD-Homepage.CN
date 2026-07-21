import { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { ProductDetailContent } from "./ProductDetailContent";
import { ProductJsonLd, BreadcrumbJsonLd, FAQJsonLd } from "@/components/seo/JsonLd";
import { generateProductFaqs } from "@/config/geo-faq";

// ISR: 产品详情页每60秒重新验证一次
export const revalidate = 60;

// 允许动态生成未预渲染的路由参数
export const dynamicParams = true;

// 基础 URL
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nihplod.cn";

type PageProps = {
  params: Promise<{ slug: string }>;
};

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
    where: { slug, published: true },
    select: {
      name: true,
      nameEn: true,
      description: true,
      benefits: true,
      images: { take: 1, select: { url: true } },
    },
  });

  if (!product) {
    return {
      title: "产品未找到",
    };
  }

  const description =
    "NIHPLOD 旎柏，是源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于为高净值人士打造简单、高效的护肤体验。";
  const productKeywords = [
    product.name,
    product.nameEn,
    "NIHPLOD",
    "旎柏",
    ...(product.benefits || []),
    "高端护肤",
    "摩纳哥护肤",
    "脂质体护肤",
  ];

  const ogImageUrl = `${baseUrl}/images/og-image.png`;

  return {
    title: product.name,
    description: description,
    keywords: productKeywords,
    alternates: {
      canonical: `/products/${slug}`,
    },
    openGraph: {
      title: `${product.name} | NIHPLOD 旎柏`,
      description: description,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: product.name }],
    },
    twitter: {
      card: "summary",
      title: `${product.name} | NIHPLOD 旎柏`,
      description: description,
      images: [ogImageUrl],
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
      purchaseLinks: {
        select: { id: true, platform: true, url: true },
      },
    },
  });

  if (!product) return null;

  return {
    ...product,
    price: Number(product.price),
    origin: product.origin,
    salesCount: product.salesCount,
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
      <FAQJsonLd
        items={
          (product.geoFaqs as { question: string; answer: string }[]) ||
          generateProductFaqs({
            name: product.name,
            nameEn: product.nameEn,
            categoryName: product.category.name,
            benefits: product.benefits,
            description: product.description,
          })
        }
      />

      <ProductDetailContent
        product={product}
        relatedProducts={relatedProducts}
        breadcrumbs={breadcrumbs}
      />
    </>
  );
}

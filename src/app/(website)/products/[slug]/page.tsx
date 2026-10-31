import { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { ProductDetailContent } from "./ProductDetailContent";
import { ProductJsonLd, BreadcrumbJsonLd, FAQJsonLd } from "@/components/seo/JsonLd";
import { resolveProductFaqs } from "@/lib/product-faqs";
import { mockProducts } from "../mock-data";
import { SITE_URL as baseUrl } from "@/lib/site-url";

// ISR: 产品详情页每60秒重新验证一次
export const revalidate = 60;

// 允许动态生成未预渲染的路由参数
export const dynamicParams = true;

const isDev = process.env.NODE_ENV === "development";

/**
 * 从产品富文本描述生成 meta description：剥离 HTML 标签并截取前 150 字
 */
function toMetaDescription(html: string | null | undefined, fallback: string): string {
  if (!html) return fallback;
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  return text.length > 150 ? `${text.slice(0, 150).trimEnd()}…` : text;
}

/**
 * 生成 OG 图片绝对 URL：优先产品首图，无图时用通用品牌图
 */
function toOgImageUrl(url: string | null | undefined): string {
  if (!url) return `${baseUrl}/images/og-image.png`;
  return url.startsWith("http") ? url : `${baseUrl}${url}`;
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * 生成静态参数
 * 在构建时尝试预渲染产品页面，如果数据库不可用则返回空数组
 */
export async function generateStaticParams() {
  if (isDev) {
    return mockProducts.map((p) => ({ slug: p.slug }));
  }

  try {
    const products = await prisma.product.findMany({
      where: { published: true, category: { visible: true } },
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

  if (isDev) {
    const mockProduct = mockProducts.find((p) => p.slug === slug);
    if (!mockProduct) {
      return { title: "产品未找到" };
    }
    const mockDescription = toMetaDescription(
      mockProduct.description,
      "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。"
    );
    const mockOgImageUrl = toOgImageUrl(mockProduct.images[0]?.url);
    return {
      title: mockProduct.name,
      description: mockDescription,
      keywords: [mockProduct.name, mockProduct.nameEn, "NIHPLOD", "旎柏", ...mockProduct.benefits],
      alternates: { canonical: `/products/${slug}` },
      openGraph: {
        title: `${mockProduct.name} | NIHPLOD 旎柏`,
        description: mockDescription,
        images: [{ url: mockOgImageUrl, alt: mockProduct.name }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${mockProduct.name} | NIHPLOD 旎柏`,
        description: mockDescription,
        images: [mockOgImageUrl],
      },
    };
  }

  const product = await prisma.product.findFirst({
    where: { slug, published: true, category: { visible: true } },
    select: {
      name: true,
      nameEn: true,
      description: true,
      benefits: true,
      images: { take: 1, orderBy: { order: "asc" }, select: { url: true } },
    },
  });

  if (!product) {
    return {
      title: "产品未找到",
    };
  }

  const description = toMetaDescription(
    product.description,
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。"
  );
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

  const ogImageUrl = toOgImageUrl(product.images[0]?.url);

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
      images: [{ url: ogImageUrl, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
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
  if (isDev) {
    const product = mockProducts.find((p) => p.slug === slug);
    if (!product) return null;
    return {
      ...product,
      origin: null as string | null,
      geoFaqs: null,
      images: product.images.map((img, i) => ({ ...img, id: `mock-img-${i}` })),
    };
  }

  const product = await prisma.product.findFirst({
    where: { slug, published: true, category: { visible: true } },
    include: {
      category: {
        select: { id: true, name: true, nameEn: true, slug: true },
      },
      images: {
        orderBy: { order: "asc" },
        select: { id: true, url: true, alt: true },
      },
      purchaseLinks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          platform: true,
          platformKey: true,
          url: true,
          miniProgramShortLink: true,
          miniProgramPath: true,
        },
      },
    },
  });

  if (!product) return null;

  return {
    ...product,
    price: Number(product.price),
    origin: product.origin,
  };
}

/**
 * 获取相关产品（同分类）
 */
async function getRelatedProducts(categoryId: string, currentProductId: string) {
  if (isDev) {
    return mockProducts
      .filter((p) => p.categoryId === categoryId && p.id !== currentProductId)
      .slice(0, 4)
      .map((p) => ({
        ...p,
        category: { name: p.category.name },
        images: p.images.slice(0, 2),
      }));
  }

  const products = await prisma.product.findMany({
    where: {
      published: true,
      categoryId,
      category: { visible: true },
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
 * 抽屉容器与顶部导航由 products/layout.tsx 中的 ProductsShell 提供，
 * 本页只负责数据、SEO 和详情内容本身。
 */
export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const product = await getProduct(slug);

  if (!product) {
    notFound();
  }

  const relatedProducts = await getRelatedProducts(product.categoryId, product.id);

  // 面包屑导航数据
  const breadcrumbs = [{ name: "产品", url: "/products" }, { name: product.category.name }];

  // 可见 FAQ、FAQPage 结构化数据与 llms 文档共用同一份问答
  const productFaqs = resolveProductFaqs({
    geoFaqs: product.geoFaqs,
    name: product.name,
    nameEn: product.nameEn,
    categoryName: product.category.name,
    benefits: product.benefits,
    description: product.description,
    ingredients: product.ingredients,
    usage: product.usage,
    capacity: product.capacity,
    origin: product.origin,
    price: product.price,
    purchasePlatforms: product.purchaseLinks.map((link) => link.platform),
  });

  return (
    <>
      {/* Schema.org 结构化数据 */}
      <ProductJsonLd product={product} />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <FAQJsonLd items={productFaqs} id={`${baseUrl}/products/${slug}#faq`} inLanguage="zh-CN" />

      <ProductDetailContent
        product={product}
        relatedProducts={relatedProducts}
        faqs={productFaqs}
      />
    </>
  );
}

import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { ProductDetailContent } from "./ProductDetailContent";
import { ProductJsonLd, BreadcrumbJsonLd, FAQJsonLd } from "@/components/seo/JsonLd";
import { resolveProductFaqs } from "@/lib/product-faqs";
import { getProductNicknames } from "@/config/product-nicknames";
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
 * 获取产品详情
 *
 * 使用 React.cache 在 generateMetadata 与页面渲染之间复用同一份查询，
 * 避免一次请求内重复查询数据库。
 */
const getProduct = cache(async (slug: string) => {
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
});

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
 *
 * 注意：产品不存在时必须在 generateMetadata 阶段 notFound()，
 * 否则 loading.tsx 的 Suspense 边界会先输出 200 shell，
 * 后续 page 里的 notFound() 只能渲染 404 UI 而无法修改状态码（软 404）。
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    // 不在这里 notFound()：metadata 阶段的 404 会落到通用错误页。
    // 返回 noindex 元数据，让 page 的 notFound() 渲染品牌 404 页面并返回 404 状态。
    return {
      title: "产品未找到",
      robots: { index: false, follow: false },
    };
  }

  const description = toMetaDescription(
    product.description,
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。"
  );
  const productKeywords = [
    product.name,
    product.nameEn,
    ...getProductNicknames(product.slug),
    "NIHPLOD",
    "旎柏",
    ...(product.benefits || []),
    "高端护肤",
    "摩纳哥护肤",
    "脂质体护肤",
  ];

  const hasProductImage = Boolean(product.images[0]?.url);
  const ogImageUrl = toOgImageUrl(product.images[0]?.url);
  const ogImage = hasProductImage
    ? { url: ogImageUrl, alt: product.name }
    : { url: ogImageUrl, width: 1200, height: 630, alt: product.name };
  const pagePath = `/products/${slug}`;

  return {
    title: product.name,
    description,
    keywords: productKeywords,
    alternates: {
      canonical: pagePath,
      languages: {
        "zh-CN": pagePath,
      },
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: pagePath,
      siteName: "NIHPLOD 旎柏",
      title: `${product.name} | NIHPLOD 旎柏`,
      description,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      site: "@nihplod",
      creator: "@nihplod",
      title: `${product.name} | NIHPLOD 旎柏`,
      description,
      images: [ogImageUrl],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
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

  // 面包屑导航数据：仅使用真实存在的页面层级，最后一项为当前产品（无 item URL）
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "产品系列", url: "/products" },
    { name: product.name },
  ];

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

      <ProductDetailContent product={product} faqs={productFaqs} />
    </>
  );
}

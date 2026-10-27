import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { SITE_URL } from "@/lib/site-url";
import { LLMS_DOCS_TAG } from "@/lib/cache-tags";
import { buildLlmsFullDoc, buildLlmsSummary, type LlmsProduct } from "@/lib/llms-docs";
import { LLMS_BRAND_SECTION, LLMS_FAQ_SECTION, LLMS_RITUALS_SECTION } from "@/config/llms-content";

/**
 * 从数据库生成 llms 文档。
 *
 * 后台产品/分类变更后通过 revalidateTag(LLMS_DOCS_TAG) 立即失效；
 * HTTP 层再配合短暂的 CDN 缓存，避免每次 AI 爬虫请求都回源。
 */
const getCachedLlmsDocs = unstable_cache(
  async () => {
    const products = await prisma.product.findMany({
      where: { published: true },
      include: {
        category: { select: { name: true } },
        purchaseLinks: {
          orderBy: { order: "asc" },
          select: { platform: true },
        },
      },
      orderBy: { order: "asc" },
    });

    const llmsProducts: LlmsProduct[] = products.map((product) => ({
      name: product.name,
      nameEn: product.nameEn,
      slug: product.slug,
      description: product.description,
      price: Number(product.price),
      benefits: product.benefits,
      ingredients: product.ingredients,
      usage: product.usage,
      capacity: product.capacity,
      origin: product.origin,
      category: { name: product.category.name },
      geoFaqs: product.geoFaqs,
      purchaseLinks: product.purchaseLinks.map((link) => ({ platform: link.platform })),
    }));

    return {
      full: buildLlmsFullDoc({
        siteUrl: SITE_URL,
        products: llmsProducts,
        brandSection: LLMS_BRAND_SECTION,
        ritualsSection: LLMS_RITUALS_SECTION,
        faqSection: LLMS_FAQ_SECTION,
      }),
      summary: buildLlmsSummary({
        siteUrl: SITE_URL,
        products: llmsProducts,
      }),
    };
  },
  ["llms-docs-v1"],
  { tags: [LLMS_DOCS_TAG], revalidate: 3600 }
);

export async function getLlmsDocs() {
  return getCachedLlmsDocs();
}

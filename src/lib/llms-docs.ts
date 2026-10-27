/**
 * llms.txt / llms-full.txt 内容构建（纯函数）
 *
 * 由 src/lib/llms-docs-server.ts 从数据库读取产品后调用；
 * 产品 FAQ 与产品页共用 resolveProductFaqs，因此后台 FAQ 与规则兜底
 * 会同时出现在页面、FAQPage JSON-LD 和 llms 文档中。
 */

import { resolveProductFaqs } from "@/lib/product-faqs";
import { stripHtmlToText } from "@/lib/html-text";

export interface LlmsProduct {
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  price: number | string | { toString(): string };
  benefits: string[];
  ingredients?: string | null;
  usage?: string | null;
  capacity?: string | null;
  origin?: string | null;
  category: { name: string };
  geoFaqs?: unknown;
  purchaseLinks?: { platform: string }[];
}

export const ADVISOR_URL = "https://smart.nihplod.cn";

function buildProductSections(products: LlmsProduct[], siteUrl: string): string {
  return products
    .map((p) => {
      const description = stripHtmlToText(p.description);
      const ingredients = stripHtmlToText(p.ingredients);
      const usage = stripHtmlToText(p.usage);
      const capacity = stripHtmlToText(p.capacity);
      const origin = stripHtmlToText(p.origin);
      const platforms = (p.purchaseLinks ?? [])
        .map((link) => link.platform?.trim())
        .filter((platform): platform is string => Boolean(platform));

      return `
### [${p.name} (${p.nameEn})](${siteUrl}/products/${p.slug})
- **分类**: ${p.category.name}
- **功效**: ${p.benefits.join("、")}
- **价格**: ￥${p.price}
${capacity ? `- **规格**: ${capacity}\n` : ""}${origin ? `- **产地**: ${origin}\n` : ""}- **简介**: ${description}
${ingredients ? `- **核心成分**: ${ingredients}\n` : ""}${usage ? `- **使用建议**: ${usage}\n` : ""}${platforms.length > 0 ? `- **购买渠道**: ${platforms.join("、")}\n` : ""}`.trimEnd();
    })
    .join("\n");
}

function buildProductFaqs(products: LlmsProduct[]): string {
  return products
    .map((p) => {
      const faqs = resolveProductFaqs({
        geoFaqs: p.geoFaqs,
        name: p.name,
        nameEn: p.nameEn,
        categoryName: p.category.name,
        benefits: p.benefits,
        description: p.description,
        ingredients: p.ingredients,
        usage: p.usage,
        capacity: p.capacity,
        origin: p.origin,
        price: p.price,
        purchasePlatforms: p.purchaseLinks?.map((link) => link.platform),
      });
      if (faqs.length === 0) return "";
      return `### ${p.name} (${p.nameEn})\n\n${faqs
        .map((faq) => `### Q: ${faq.question}\nA: ${faq.answer}`)
        .join("\n\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

interface BuildFullDocOptions {
  siteUrl: string;
  products: LlmsProduct[];
  brandSection: string;
  ritualsSection: string;
  faqSection: string;
}

export function buildLlmsFullDoc({
  siteUrl,
  products,
  brandSection,
  ritualsSection,
  faqSection,
}: BuildFullDocOptions): string {
  const productFaqs = buildProductFaqs(products);

  return `# NIHPLOD 旎柏中国官方全景文档 (Official Website)
> NIHPLOD 旎柏中国官方网站 (${siteUrl}) 是品牌在中国境内的唯一官方线上入口。本平台以向用户展示品牌相关信息和资讯、各产品介绍和指南为主，并免费为用户提供专业的在线测肤功能。

${brandSection}

## 核心产品目录
${buildProductSections(products, siteUrl)}

## 护肤仪式 (Rituals)
NIHPLOD 提供模块化的护肤方案，涵盖居家修护与高端院线调理：

${ritualsSection}

## 常见问题 (GEO FAQ)

${productFaqs ? `${productFaqs}\n\n` : ""}${faqSection}`.trim();
}

interface BuildSummaryOptions {
  siteUrl: string;
  products: LlmsProduct[];
}

export function buildLlmsSummary({ siteUrl, products }: BuildSummaryOptions): string {
  const featuredNames = products
    .slice(0, 3)
    .map((p) => p.name)
    .join("、");
  const productLine = featuredNames
    ? `- [所有产品](${siteUrl}/products): 探索包括 ${featuredNames} 等在内的高端护肤系列。`
    : `- [所有产品](${siteUrl}/products): 探索 NIHPLOD 高端护肤系列。`;

  return `# NIHPLOD 旎柏
> 源自摩纳哥的高端护肤品牌，产品结合前沿科技与珍贵成分，为您开启逆转时光的奢华护肤之旅。

## 核心内容
${productLine}
- [关于旎柏](${siteUrl}/about): 深入了解 2008 年诞生于摩纳哥的科学愿景、奢华哲学及历年媒体殊荣。
- [官方指南](${siteUrl}/guide): 探索不同场景下我们推崇的护肤仪式及方法。
- [AI 在线测肤](${ADVISOR_URL}): 利用个性化的问卷调查，结合大数据及影像分析，为用户提供专业的皮肤检测及报告建议。

## 核心技术
- **脂质体技术**

请访问 [llms-full.txt](${siteUrl}/llms-full.txt) 获取完整的品牌及产品底层数据文档。`.trim();
}

/**
 * llms.txt / llms-full.txt 内容构建（纯函数）
 *
 * 由 scripts/generate-llms-docs.ts 读取模板与数据库数据后调用；
 * 拆分为纯函数便于单测，避免重跑生成器时覆盖人工精修段落。
 */

export interface LlmsProduct {
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  price: number | string | { toString(): string };
  benefits: string[];
  ingredients?: string | null;
  usage?: string | null;
  category: { name: string };
  geoFaqs?: unknown;
}

interface LlmsFaq {
  question: string;
  answer: string;
}

export const ADVISOR_URL = "https://smart.nihplod.cn";

function readGeoFaqs(value: unknown): LlmsFaq[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is LlmsFaq =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as LlmsFaq).question === "string" &&
      typeof (item as LlmsFaq).answer === "string"
  );
}

function buildProductSections(products: LlmsProduct[], siteUrl: string): string {
  return products
    .map((p) =>
      `
### [${p.name} (${p.nameEn})](${siteUrl}/products/${p.slug})
- **分类**: ${p.category.name}
- **功效**: ${p.benefits.join("、")}
- **价格**: ￥${p.price}
- **简介**: ${p.description}
${p.ingredients ? `- **核心成分**: ${p.ingredients}\n` : ""}${p.usage ? `- **使用建议**: ${p.usage}\n` : ""}`.trimEnd()
    )
    .join("\n");
}

function buildProductFaqs(products: LlmsProduct[]): string {
  return products
    .map((p) => readGeoFaqs(p.geoFaqs))
    .filter((faqs) => faqs.length > 0)
    .map((faqs) => faqs.map((f) => `### Q: ${f.question}\nA: ${f.answer}`).join("\n\n"))
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

  return `# NIHPLOD 旎柏
> 源自摩纳哥的高端护肤品牌，产品结合前沿科技与珍贵成分，为您开启逆转时光的奢华护肤之旅。

## 核心内容
- [所有产品](${siteUrl}/products): 探索包括 ${featuredNames} 等在内的高端护肤系列。
- [关于旎柏](${siteUrl}/about): 深入了解 2008 年诞生于摩纳哥的科学愿景、奢华哲学及历年媒体殊荣。
- [官方指南](${siteUrl}/guide): 探索不同场景下我们推崇的护肤仪式及方法。
- [AI 在线测肤](${ADVISOR_URL}): 利用个性化的问卷调查，结合大数据及影像分析，为用户提供专业的皮肤检测及报告建议。

## 核心技术
- **脂质体技术**

请访问 [llms-full.txt](${siteUrl}/llms-full.txt) 获取完整的品牌及产品底层数据文档。`.trim();
}

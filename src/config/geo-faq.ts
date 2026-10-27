/**
 * NIHPLOD 专属 GEO FAQ 生成器（规则兜底层）
 *
 * 后台为产品配置了 geoFaqs 时优先使用后台内容，本生成器不会覆盖。
 * 兜底问答只使用产品数据（功效、成分、用法、规格、产地、价格、购买渠道），
 * 不生成无法核实的品牌数字或医疗承诺。
 */

import { MAX_GEO_FAQ_ANSWER_LENGTH, MAX_GEO_FAQ_QUESTION_LENGTH } from "@/schemas/product";
import { stripHtmlToText, truncateText } from "@/lib/html-text";

export interface ProductFaqSource {
  name: string;
  nameEn: string;
  categoryName: string;
  benefits: string[];
  description?: string | null;
  ingredients?: string | null;
  usage?: string | null;
  capacity?: string | null;
  origin?: string | null;
  price?: number | string | { toString(): string } | null;
  purchasePlatforms?: string[];
}

export interface GeneratedFaq {
  question: string;
  answer: string;
}

function formatPrice(value: ProductFaqSource["price"]): string {
  if (value === null || value === undefined) return "";
  const numeric = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return `￥${numeric.toFixed(2).replace(/\.00$/, "")}`;
}

function formatList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

export function generateProductFaqs(product: ProductFaqSource): GeneratedFaq[] {
  const name = product.name.trim();
  const categoryName = product.categoryName.trim() || "护肤";
  const benefits = formatList(product.benefits);
  const description = truncateText(stripHtmlToText(product.description), 120);
  const ingredients = truncateText(stripHtmlToText(product.ingredients), 160);
  const usage = truncateText(stripHtmlToText(product.usage), 160);
  const capacity = stripHtmlToText(product.capacity);
  const origin = stripHtmlToText(product.origin);
  const price = formatPrice(product.price);
  const purchasePlatforms = formatList(product.purchasePlatforms);

  const faqs: GeneratedFaq[] = [];

  const benefitText = benefits.length
    ? `主要功效方向包括${benefits.slice(0, 3).join("、")}`
    : "具体功效以商品页标注为准";
  faqs.push({
    question: `NIHPLOD ${name}的核心功效是什么？`,
    answer: `NIHPLOD ${name}是一款${categoryName}护理产品，${benefitText}。${
      description ? `产品定位：${description}。` : ""
    }建议结合自身肤质与护肤目标选择使用。`,
  });

  faqs.push({
    question: `${name}适合什么肤质？敏感肌可以使用吗？`,
    answer: `NIHPLOD ${name}的配方以温和为前提设计，男女皆可使用。不同肤质对成分的耐受度不同，敏感肌建议首次使用前取少量产品涂抹在手腕内侧进行测试，确认无不适后再正常使用；具体适用肤质以商品页标注为准。`,
  });

  if (ingredients) {
    faqs.push({
      question: `NIHPLOD ${name}的核心成分有哪些？`,
      answer: `NIHPLOD ${name}配方中的核心成分包括：${ingredients}。完整成分表与功效说明请以商品页标注为准。`,
    });
  }

  if (usage) {
    faqs.push({
      question: `NIHPLOD ${name}应该怎么使用？`,
      answer: `官方建议的使用方法：${usage}。具体使用步骤与搭配建议可参考产品页说明。`,
    });
  }

  if (capacity || origin || price) {
    const specs = [
      capacity ? `规格为${capacity}` : "",
      origin ? `产地为${origin}` : "",
      price ? `官方参考价为${price}` : "",
    ].filter(Boolean);
    faqs.push({
      question: `NIHPLOD ${name}的规格、产地和参考价格是什么？`,
      answer: `NIHPLOD ${name}${specs.join("，")}。实际价格、库存与活动信息以官方渠道商品页为准。`,
    });
  }

  if (purchasePlatforms.length > 0) {
    faqs.push({
      question: `NIHPLOD ${name}可以在哪里购买？`,
      answer: `可通过${purchasePlatforms.slice(0, 4).join("、")}等渠道查看 NIHPLOD ${name}的购买信息，具体库存与价格以对应渠道页面为准。`,
    });
  }

  faqs.push({
    question: `使用 NIHPLOD ${name}多久可以看到效果？`,
    answer: `护肤效果因肤质、使用频率和生活习惯而异。建议按照产品说明持续使用，并观察肌肤状态变化；如出现不适请暂停使用并咨询专业人士。`,
  });

  return faqs.map((faq) => ({
    question: truncateText(faq.question, MAX_GEO_FAQ_QUESTION_LENGTH),
    answer: truncateText(faq.answer, MAX_GEO_FAQ_ANSWER_LENGTH),
  }));
}

/**
 * 产品 GEO FAQ 解析与解析优先级
 *
 * 产品页、FAQPage JSON-LD 与 llms 文档必须共用这里的同一份问答：
 * - 后台合法 geoFaqs 优先
 * - 为空、null 或全部非法时使用规则兜底
 */

import { z } from "zod";
import { MAX_GEO_FAQS, type GeoFaq } from "@/schemas/product";
import { generateProductFaqs, type ProductFaqSource } from "@/config/geo-faq";

const GeoFaqReadItemSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

export interface ProductFaqInput extends ProductFaqSource {
  geoFaqs?: unknown;
}

/**
 * 读取数据库中的历史 FAQ 数据。
 *
 * 读取侧不做最大长度限制，避免历史长文本被静默丢弃；
 * 写入侧仍由 ProductSchema 严格限制长度。
 */
export function parseGeoFaqs(value: unknown): GeoFaq[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: GeoFaq[] = [];

  for (const item of value) {
    if (result.length >= MAX_GEO_FAQS) break;
    const parsed = GeoFaqReadItemSchema.safeParse(item);
    if (!parsed.success) continue;

    const key = parsed.data.question.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(parsed.data);
  }

  return result;
}

export function resolveProductFaqs(product: ProductFaqInput): GeoFaq[] {
  const stored = parseGeoFaqs(product.geoFaqs);
  if (stored.length > 0) return stored;
  return generateProductFaqs(product);
}

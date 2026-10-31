/**
 * 产品昵称映射（小红书/抖音等社媒常用叫法）。
 *
 * 用途：
 * - Product JSON-LD 的 alternateName，帮助搜索/AI 把昵称与正式产品名关联；
 * - 产品页 metadata keywords；
 * - 与 next.config.mjs 中的昵称重定向保持一致。
 */
export const PRODUCT_NICKNAMES: Record<string, string[]> = {
  serum: ["童颜精华"],
  "face-cream": ["白魔法面霜"],
  "treatment-oil": ["绿魔法护理油"],
  "face-mask": ["守护面膜"],
  "body-lotion": ["聚宝瓶身体乳"],
  sunscreen: ["蛋定防晒"],
  "face-scrub": ["黑曜磨砂膏"],
  "foam-cleanser": ["云朵洁面"],
  "hand-cream": ["随身笔护手霜"],
};

export function getProductNicknames(slug: string): string[] {
  return PRODUCT_NICKNAMES[slug] ?? [];
}

/**
 * 通过昵称反查产品 slug。
 * 入参可以是带前导斜杠的路径（如 "/童颜精华"），也可以是纯昵称。
 */
export function getProductSlugByNickname(nickname: string): string | null {
  const normalized = nickname.replace(/^\/+|\/+$/g, "");
  if (!normalized) return null;

  for (const [slug, nicknames] of Object.entries(PRODUCT_NICKNAMES)) {
    if (nicknames.includes(normalized)) return slug;
  }
  return null;
}

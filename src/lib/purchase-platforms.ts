export const PURCHASE_PLATFORM_KEYS = ["tmall", "xiaohongshu", "douyin", "wechat-shop"] as const;

export type PurchasePlatformKey = (typeof PURCHASE_PLATFORM_KEYS)[number];

export const PURCHASE_PLATFORM_LABELS: Record<PurchasePlatformKey, string> = {
  tmall: "天猫国际",
  xiaohongshu: "小红书",
  douyin: "抖音",
  "wechat-shop": "微信小店",
};

export const PURCHASE_PLATFORM_OPTIONS = PURCHASE_PLATFORM_KEYS.map((value) => ({
  value,
  label: PURCHASE_PLATFORM_LABELS[value],
}));

const PLATFORM_KEY_BY_NAME: Record<string, PurchasePlatformKey> = {
  天猫: "tmall",
  天猫国际: "tmall",
  tmall: "tmall",
  小红书: "xiaohongshu",
  xiaohongshu: "xiaohongshu",
  xhs: "xiaohongshu",
  抖音: "douyin",
  douyin: "douyin",
  抖音商城: "douyin",
  微信小店: "wechat-shop",
  微信小铺: "wechat-shop",
  "wechat-shop": "wechat-shop",
  wechat_shop: "wechat-shop",
};

export function isPurchasePlatformKey(value: unknown): value is PurchasePlatformKey {
  return typeof value === "string" && (PURCHASE_PLATFORM_KEYS as readonly string[]).includes(value);
}

export function isOfficialPurchasePlatform(value: string | null | undefined): boolean {
  return !!value && value.trim().includes("官方商城");
}

export function resolvePurchasePlatformKey(
  value: string | null | undefined
): PurchasePlatformKey | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || isOfficialPurchasePlatform(normalized)) return null;

  const direct = PLATFORM_KEY_BY_NAME[normalized];
  if (direct) return direct;

  if (normalized.includes("天猫")) return "tmall";
  if (normalized.includes("小红书")) return "xiaohongshu";
  if (normalized.includes("抖音")) return "douyin";
  if (normalized.includes("微信小店") || normalized.includes("微信小铺")) {
    return "wechat-shop";
  }
  return null;
}

export function getPurchasePlatformLabel(key: PurchasePlatformKey): string {
  return PURCHASE_PLATFORM_LABELS[key];
}

export interface NormalizedPurchaseLink {
  id?: string;
  platformKey: PurchasePlatformKey | null;
  platform: string;
  url: string;
  miniProgramShortLink: string | null;
  miniProgramPath: string | null;
  order: number;
}

export interface PurchaseLinkInput {
  id?: string;
  platformKey?: string | null;
  platform?: string | null;
  url: string;
  miniProgramShortLink?: string | null;
  miniProgramPath?: string | null;
  order?: number;
}

export function normalizePurchaseLink(input: PurchaseLinkInput): NormalizedPurchaseLink {
  const platformKey = isPurchasePlatformKey(input.platformKey)
    ? input.platformKey
    : resolvePurchasePlatformKey(input.platform);
  const platform = platformKey
    ? getPurchasePlatformLabel(platformKey)
    : (input.platform ?? "").trim();

  const miniProgramShortLink = input.miniProgramShortLink?.trim() || null;
  const miniProgramPath = input.miniProgramPath?.trim() || null;

  return {
    id: input.id,
    platformKey,
    platform,
    url: input.url.trim(),
    miniProgramShortLink,
    miniProgramPath,
    order: input.order ?? 0,
  };
}

export function isDuplicateCanonicalPurchasePlatform(
  links: { platformKey?: string | null; platform?: string | null }[]
): boolean {
  const keys = links
    .map((link) =>
      isPurchasePlatformKey(link.platformKey)
        ? link.platformKey
        : resolvePurchasePlatformKey(link.platform)
    )
    .filter((key): key is PurchasePlatformKey => key !== null);
  return new Set(keys).size !== keys.length;
}

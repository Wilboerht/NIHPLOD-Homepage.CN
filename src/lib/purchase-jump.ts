import type { PurchasePlatformKey } from "@/lib/purchase-platforms";
import { isPurchasePlatformKey } from "@/lib/purchase-platforms";

export const PURCHASE_PLATFORM_APP_IDS: Partial<Record<PurchasePlatformKey, string>> = {
  tmall: process.env.NEXT_PUBLIC_PURCHASE_TMALL_APP_ID || "",
  xiaohongshu: process.env.NEXT_PUBLIC_PURCHASE_XIAOHONGSHU_APP_ID || "",
  douyin: process.env.NEXT_PUBLIC_PURCHASE_DOUYIN_APP_ID || "",
  "wechat-shop": process.env.NEXT_PUBLIC_PURCHASE_WECHAT_SHOP_APP_ID || "",
};

export type PurchaseJump =
  | {
      type: "miniprogram";
      shortLink?: string;
      appId?: string;
      path?: string;
    }
  | {
      type: "copy";
    };

export interface PurchaseJumpInput {
  platformKey?: string | null;
  miniProgramShortLink?: string | null;
  miniProgramPath?: string | null;
}

export function buildPurchaseJump(input: PurchaseJumpInput): PurchaseJump {
  const shortLink = input.miniProgramShortLink?.trim();
  if (shortLink) {
    return { type: "miniprogram", shortLink };
  }

  const path = input.miniProgramPath?.trim();
  const platformKey = isPurchasePlatformKey(input.platformKey) ? input.platformKey : null;
  const appId = platformKey ? PURCHASE_PLATFORM_APP_IDS[platformKey] : undefined;
  if (appId && path) {
    return { type: "miniprogram", appId, path };
  }

  return { type: "copy" };
}

import type { PurchasePlatformKey } from "@/lib/purchase-platforms";

export interface PurchaseLinkItem {
  id?: string;
  platformKey?: PurchasePlatformKey | null;
  platform: string;
  url: string;
  miniProgramShortLink?: string | null;
  miniProgramPath?: string | null;
  order: number;
  clientKey?: string;
}

export function createPurchaseLinkKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

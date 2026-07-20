const ICON_BASE = "/images/products";

export const CATEGORY_ICON_PATH: Record<string, string> = {
  洁面: `${ICON_BASE}/Foam Cleanser.svg`,
  面霜: `${ICON_BASE}/Face Cream.svg`,
  精华露: `${ICON_BASE}/Serum.svg`,
  面膜: `${ICON_BASE}/Face Mask.svg`,
  护手霜: `${ICON_BASE}/Hand Cream.svg`,
  防晒: `${ICON_BASE}/Sunscreen.svg`,
  身体乳: `${ICON_BASE}/Body Lotion.svg`,
  磨砂膏: `${ICON_BASE}/Face Scrub.svg`,
  护理油: `${ICON_BASE}/Treatment Oil.svg`,
};

export function getCategoryIconPath(categoryName: string): string | undefined {
  return CATEGORY_ICON_PATH[categoryName];
}

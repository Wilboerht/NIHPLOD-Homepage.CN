const rawSiteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://nihplod.cn";

export const SITE_URL = rawSiteUrl.replace(/\/+$/, "");

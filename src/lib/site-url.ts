const rawSiteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://nihplod.cn";

export const SITE_URL = rawSiteUrl.replace(/\/+$/, "");

// 生产环境若误用 .env.local 的 localhost，会污染 canonical / sitemap / JSON-LD / llms。
// 这里只告警不抛错，避免阻断本地 production 预览；上线前请运行 npm run check:production-env。
if (
  process.env.NODE_ENV === "production" &&
  /(^https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(SITE_URL)
) {
  console.warn(
    `[SEO] SITE_URL 正在使用本机地址 ${SITE_URL}，生产环境必须配置为 https://nihplod.cn`
  );
}

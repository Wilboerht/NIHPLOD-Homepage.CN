/**
 * 公开站点（招聘页）使用的高德 JS API 配置。
 *
 * 公开页会向浏览器暴露 securityJsCode，这是 AMap JS API 的机制决定的；
 * 因此这里只使用独立的公开 key，并在高德控制台配置域名白名单。
 * 管理端地址搜索已改为服务端代理，不使用这里的配置。
 */
export function getPublicAmapConfig(): { key: string; secret: string } {
  const key = process.env.AMAP_PUBLIC_KEY || process.env.NEXT_PUBLIC_AMAP_KEY || "";
  const secret = process.env.AMAP_PUBLIC_SECRET || process.env.NEXT_PUBLIC_AMAP_SECRET || "";
  return { key, secret };
}

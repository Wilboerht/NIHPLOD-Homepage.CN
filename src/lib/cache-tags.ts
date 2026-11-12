export const LLMS_DOCS_TAG = "llms-docs";

/**
 * 产品/分类前台数据缓存 tag。
 *
 * 产品详情页、列表页与分类查询都通过 unstable_cache 共享这份缓存；
 * 后台产品/分类变更时统一 revalidateTag 让数据立即失效。
 */
export const PRODUCTS_TAG = "products";

/**
 * 法务文档（服务条款 / 隐私政策）前台缓存 tag。
 * 发布新版本后统一失效，避免等待 300 秒数据缓存过期。
 */
export const LEGAL_DOCS_TAG = "legal-documents";

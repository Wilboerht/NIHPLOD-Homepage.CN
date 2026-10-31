export const LLMS_DOCS_TAG = "llms-docs";

/**
 * 产品/分类前台数据缓存 tag。
 *
 * 产品详情页、列表页与分类查询都通过 unstable_cache 共享这份缓存；
 * 后台产品/分类变更时统一 revalidateTag 让数据立即失效。
 */
export const PRODUCTS_TAG = "products";

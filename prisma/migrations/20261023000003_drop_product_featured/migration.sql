-- 产品“推荐位”未在前台消费，移除冗余字段与索引。
-- 前台 /products 的「精选推荐」保持按 order/createdAt 取前三个已发布商品。
DROP INDEX IF EXISTS "Product_featured_order_idx";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "featured";
